# Shopee Online Orders Integration

Tracks Shopee checkout orders and channel stock allocation inside RHET Inventory without changing the existing PSMS/CMS stock-request workflow.

The integration was built in two phases. **Phase 2B (current)** replaces the Phase 1 order-based stock deduction with an **allocation model**, and repurposes the Online Orders page into a **fulfillment tracking board**. Phase 1 behavior described further below is kept only for historical/audit compatibility.

## Stock model: ship deduct via CSV/XLSX import (current)

Shopee Open API is not available yet, so RHET uses **Seller Centre export import**. Warehouse stock is deducted when an order becomes **`SHIPPED`** (import or **Mark shipped**), for **mapped** line items only.

| Step | RHET stock | Movement |
|---|---|---|
| Import unpaid / to ship (mapped) | unchanged | none |
| Map unmatched / bundle lines | unchanged | none |
| Order enters `SHIPPED` (mapped + enough stock) | −qty | `ONLINE_SALE` |
| Mark shipped blocked if unmatched or short stock | unchanged | none |
| Cancel after deduct | +qty | `CANCELLED` |
| Reusable return confirmed | +qty | `RETURN` |
| Not-reusable return | unchanged | none |

Rules:

1. Channel **allocation UI is hidden** (no Shopee API). Allocate APIs remain in code for a future Phase 4 but are not used in the product UI.
2. **Map all lines** before shipping. Bundle lines use multi-item matches with per-item qty.
3. **Mark shipped** and import-to-`SHIPPED` require sufficient stock; otherwise the action is blocked (manual) or fulfillment is left unchanged (import).
4. Re-import never deducts twice (`DEDUCTED` + `movement_id` on matches).
5. Returns: reusable restores mapped qtys; not-reusable restores nothing.

### Legacy note (Phase 2B allocation)

Earlier builds deducted on Inventory “Allocate to Shopee”. That path is retired in the UI while Open Platform credentials are unavailable. Tables `channel_stock_snapshots` / `channel_allocation_logs` are kept for a future live sync.

## Fulfillment tracking board (Phase 2B)

The Online Orders page is now an **internal delivery tracker**, table-style with status tabs (not a kanban board, to reuse the existing responsive-table pattern). It is for admin/user staff only — there is no customer-facing tracking view.

`fulfillment_status` is a separate column from `order_status` (SKU matching). Moving an order to **`SHIPPED`** deducts mapped RHET stock. Return confirmation may restore stock when reusable.

| Column | Meaning |
|---|---|
| `PROCESSING` | Customer checked out on Shopee (CSV sync / pre-board) |
| `READY_TO_SHIP` | Seller admin confirmed/processed the order (CSV sync / pre-board) |
| `SHIPPED` | Handed to courier (board tab; stock deducts here) |
| `DELIVERED` | Customer received the item (was `RECEIVED`) |
| `RETURNED` | Return completed (was `RETURN` + `RETURN_CONFIRMED`) |
| `CANCELLED` | Order cancelled on Shopee or cancelled in RHET (terminal) |

UI board tabs (Shopee-aligned): **All**, **Unpaid**, **To Ship**, **Shipping**, **Completed**, **Return/Refund/Cancel**.
Internal codes: `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `RETURNED` + `CANCELLED` (grouped in the last tab).
Stock deducts when status becomes **`SHIPPED` (Shipping)**. Allowed transitions: `PROCESSING → READY_TO_SHIP → SHIPPED → DELIVERED`, and `SHIPPED`/`DELIVERED → RETURNED` via confirm-return (reusable / not reusable in one step). Cancel is a side-exit to `CANCELLED` (not available from Returned).

### API — Fulfillment & returns

Base path: `/api/v1/online-orders`

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/:id/fulfillment-status` | Admin | Manually move an order forward `{ status }` (`READY_TO_SHIP`\|`SHIPPED`\|`DELIVERED`) |
| POST | `/:id/confirm-return` | Admin | Mark returned from `SHIPPED`/`DELIVERED` `{ reusable: boolean, notes? }` — reusable restores RHET stock via `RETURN`, not reusable restores nothing |

## Phase 1 (implemented, superseded by allocation model above)

The original Phase 1 ingestion pipeline is unchanged and still used for order visibility:

1. Import Shopee order exports (CSV) or add orders manually
2. Match each Shopee line item to RHET inventory through `channel_sku_mappings`
3. Flag unmatched lines as `UNMATCHED` for admin review (order becomes `NEEDS_ATTENTION`)
4. Persist SKU mappings so future imports auto-resolve the same Shopee SKU

Historical orders imported before Phase 2B may still show `DEDUCTED`/`OVERSOLD` line statuses from the old `ONLINE_SALE` deduction path. These are read-only legacy states; `computeOrderStatus` treats `DEDUCTED` the same as `MATCHED` for backward compatibility, and cancel/restore logic still honors any legacy `movement_id` on those lines.

| Source | Auth | Notes |
|---|---|---|
| CSV / XLSX import | Firebase admin or user staff | Upload Shopee Seller Centre order export `.csv` or `.xlsx` (preview → confirm) |
| Manual order entry | Firebase admin or user staff | One-off order when live sync is unavailable |

### Import preview and re-import fulfillment sync

1. Admin selects a Shopee `.csv` or `.xlsx` → RHET calls `POST /online-orders/import/preview` (no DB writes).
2. UI shows new vs existing orders and any **forward-only** fulfillment changes driven by the export’s Order Status.
3. Admin confirms → `POST /online-orders/import` saves orders/lines and may advance `fulfillment_status`.

Re-import rules for delivery status:

- Status follows the **exported** Shopee value (e.g. still “To Receive” → stay `SHIPPED`; “Completed” → `DELIVERED`).
- Only **forward** moves are applied; never move backward (e.g. `DELIVERED` → `SHIPPED`).
- Rows already in `RETURNED` are not changed by import.
- Import still may deduct RHET stock when advancing into `SHIPPED` (mapped lines + sufficient stock).
- Manual fulfillment buttons remain available as override (**Mark shipped** requires mapped lines and stock).

## Phase 4 (future, needs Shopee API credentials — not implemented yet)

Requires an approved Shopee Seller profile + Partner ID + Partner Key + shop OAuth authorization:

- `shopee_connections` table (shop_id, access_token, refresh_token, expires_at) + token refresh logic
- OAuth connect flow: `GET /shopee/oauth/start` + `/callback` (admin)
- Baseline snapshot on first connect (populates `channel_stock_snapshots.baseline_qty`)
- `update_stock` push: RHET allocation → set Shopee listing qty
- Order Status Push webhook (Code 3): auto-updates `fulfillment_status`, `POST /shopee/webhook` (public route, HMAC signature verification, respond 200 fast, then fetch order detail)
- Polling fallback for missed webhooks
- Admin "Connect Shopee" + sync status UI

Phase 4 will call the same allocation/fulfillment services used by the manual UI. No further schema changes are expected beyond the `shopee_connections` table.

## CSV column mapping

The parser accepts common Shopee export headers and maps them flexibly:

| Shopee column aliases | RHET field |
|---|---|
| `Order ID`, `Order SN`, `ordersn` | `externalOrderId` |
| `Username (Buyer)`, `Buyer Username` | `buyerName` |
| `Order Creation Date`, `Create Time` | `orderPlacedAt` |
| `SKU Reference No.`, `SKU` | `externalSku` |
| `Product Name` | `externalItemName` |
| `Variation Name`, `Model Name` | `externalVariation` |
| `Quantity` | `quantity` |
| `Deal Price`, `Original Price` | `unitPrice` |
| `Order Total`, `Total Amount` | `totalAmount` |
| `Order Status`, `Status`, `Parcel Status`, `Shipping Status` | mapped → `fulfillment_status` (forward-only on import) |

Approximate Shopee status → RHET fulfillment mapping:

| Shopee export text (examples) | RHET `fulfillment_status` |
|---|---|
| Unpaid / To Pay / Processing | `PROCESSING` |
| To Ship / Ready To Ship / Processed | `READY_TO_SHIP` |
| Shipped / To Receive / Shipping | `SHIPPED` |
| Completed / Delivered / Received | `DELIVERED` |
| Return / Refund | `RETURNED` (only from `SHIPPED` or `DELIVERED`) |
| Cancelled | `CANCELLED` (from active stages; not from Return) |

Multiple CSV rows with the same order ID are grouped into one order with multiple line items.

## Matching rules (no stock effect)

1. Look up `channel_sku_mappings` by `(channel, external_sku)`
2. If Shopee SKU was blank (`ROW-n`), try `channel_sku_mappings` by `external_variation`
3. If still no mapping, match when `external_sku` equals an active RHET `inventory.sku` (case-insensitive) and remember that mapping for later imports
4. If no match exists, or the matched item is inactive → line status `UNMATCHED`, order becomes `NEEDS_ATTENTION`
5. If a match exists and is active → line status `MATCHED`
6. Order status is derived from line statuses:
   - all matched (or cancelled) with at least one matched → `FULFILLED`
   - any unmatched → `NEEDS_ATTENTION`
   - all cancelled → `CANCELLED`

Re-importing the same Shopee order ID upserts order/line details and may advance fulfillment from the export status (forward-only).

## Admin resolution workflow

When a line is `UNMATCHED`:

1. Open **Online Orders** → order details → **Map item**
2. Pick a **category**, then the RHET **inventory item** (add more rows for bundles; set qty per item)
3. Set a configurable quantity per RHET item (bundle / kit lines)
4. Save — RHET marks the line `MATCHED` (still no stock effect)

API body for `POST /items/:id/resolve`:

```json
{
  "matches": [
    { "inventoryId": "uuid", "quantity": 2 },
    { "inventoryId": "uuid", "quantity": 1 }
  ]
}
```

Legacy single-item body `{ "inventoryId": "uuid" }` still works. Multi-item rows are stored in `online_order_item_matches`; `online_order_items.matched_inventory_id` keeps the first (primary) match for backward compatibility. Synthetic CSV SKUs (`ROW-n`) are not written to `channel_sku_mappings`.

Future imports with a real Shopee SKU auto-resolve through the saved primary channel mapping (single-item). Bundle lines still need multi-map when there is no real SKU.

## REST API — Orders (Firebase auth)

Base path: `/api/v1/online-orders`

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | Admin/User | List online orders (`?status=`, `?fulfillmentStatus=`, `?channel=`, `?search=`) |
| GET | `/:id` | Admin/User | Order detail with line items |
| GET | `/mappings` | Admin/User | List channel SKU mappings |
| POST | `/import/preview` | Admin | Dry-run parse + compare (no save) `{ csvText }` or `{ fileBase64, fileName }` |
| POST | `/import` | Admin | Confirm import Shopee `.csv` / `.xlsx` |
| POST | `/manual` | Admin | Create one manual order |
| POST | `/items/:id/resolve` | Admin | Map line to one or more inventory items (`matches[]` or legacy `inventoryId`) |
| POST | `/items/:id/cancel` | Admin | Cancel one line (restores stock only for legacy deducted lines) |
| POST | `/:id/cancel` | Admin | Cancel entire order (restores stock only for legacy deducted lines) |
| POST | `/:id/fulfillment-status` | Admin | Move order to the next fulfillment column |
| POST | `/:id/confirm-return` | Admin | Resolve a return (reusable/not reusable) |

## Database tables

- `online_orders` (now includes `fulfillment_status`, `return_reusable`, `return_notes`)
- `online_order_items`
- `online_order_item_matches` (multi RHET items per Shopee line; migration `019`)
- `channel_sku_mappings`
- `channel_stock_snapshots` (Phase 2B)
- `channel_allocation_logs` (Phase 2B)

Migrations: `010_online_orders.sql`, `011_channel_allocation_and_fulfillment.sql`, `019_online_order_item_matches.sql`, `020_fulfillment_cancelled.sql`

## Relationship to PSMS integration

| Feature | PSMS/CMS | Shopee Online Orders |
|---|---|---|
| Direction | External system pushes requests into RHET | RHET ingests marketplace orders |
| Auth | Integration API key | Firebase admin |
| Stock trigger | Manual approve/reject | Manual allocation (not order checkout) |
| Stock movement | `RELEASED` | `CHANNEL_ALLOCATION`, `RETURN` |
| Outbound webhook | Yes | No (Phase 4) |

Both modules share the same inventory balances and movement audit trail. Neither integration was modified by the other.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Import fails on row X | Missing order ID or quantity | Fix CSV row or export format |
| All lines unmatched | No SKU mappings yet | Map lines from the Online Orders detail modal |
| "INSUFFICIENT_STOCK" on allocate | Not enough RHET stock for the requested allocation | Restock first, or allocate a smaller quantity |
| "INSUFFICIENT_ALLOCATION" on deallocate | Trying to deallocate more than is currently allocated | Check the allocation modal's current allocated qty |
| Fulfillment status move rejected (409) | Skipping a column, e.g. `PROCESSING → DELIVERED` | Move through the columns in order, or use return flow |
| Return confirm rejected (409) | Order is not currently in the `RETURN` column | Move the order to `RETURN` first |

If your Shopee export uses different column names, share a sample file so the alias list in `online-order.service.js` can be updated.
