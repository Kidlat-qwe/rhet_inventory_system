# Shopee Online Orders Integration

Tracks Shopee checkout orders and channel stock allocation inside RHET Inventory without changing the existing PSMS/CMS stock-request workflow.

The integration was built in two phases. **Phase 2B (current)** replaces the Phase 1 order-based stock deduction with an **allocation model**, and repurposes the Online Orders page into a **fulfillment tracking board**. Phase 1 behavior described further below is kept only for historical/audit compatibility.

## Stock model: allocation, not order deduction (Phase 2B)

RHET stock is deducted when the admin **allocates** units to the Shopee channel — not when a Shopee customer checks out. This is the "RHET-initiated" model, chosen because the RHET inventory admin and the Shopee seller are the same person/team (no third-party seller to reconcile with).

| Step | RHET stock | Shopee allocated qty | Movement |
|---|---|---|---|
| Initial | 100 | 0 | — |
| Admin allocates 20 to Shopee | 80 (−20) | 20 | `CHANNEL_ALLOCATION` (deduct) |
| Buyer purchases 1 on Shopee | 80 (unchanged) | 19 | none in RHET |
| Return initiated (inspecting) | 80 (unchanged) | 19 | none yet |
| Admin confirms reusable | 81 (+1) | 19 | `RETURN` |
| Admin confirms not reusable | 80 (unchanged) | 19 | none |
| Admin deallocates unsold stock | +qty | −qty | `CHANNEL_ALLOCATION` (add) |

Rules:

1. Importing/creating a Shopee order **never deducts RHET stock**. Orders are matched to inventory for visibility/reporting only (`MATCHED` / `UNMATCHED` line status).
2. Stock only moves when an admin explicitly allocates or deallocates from the **Inventory** page ("Shopee" column → allocation modal).
3. Returns are never auto-restored. An inventory admin must confirm reusable/not-reusable from the fulfillment board's Return step.
4. Not-reusable returns intentionally create **no stock movement** — the unit was already allocated out of the warehouse, so there is nothing to "damage" in RHET; it simply never comes back. This is a deliberate deviation from a literal `DAMAGED` movement, which would incorrectly deduct stock a second time.
5. First-time Shopee API connection (Phase 4, not built yet) will take a baseline snapshot and will not retroactively deduct existing Shopee stock.

### Data model

- `channel_stock_snapshots` — one row per `(channel, inventory_id)`. Tracks `allocated_qty` (cumulative units currently allocated to the channel) and reserves `baseline_qty` / `last_synced_at` for the future live Shopee sync.
- `channel_allocation_logs` — append-only audit trail of every allocate/deallocate action, linked to the `stock_movements` row it produced.
- `stock_movements.movement_type` gained `CHANNEL_ALLOCATION` (direction-based, like `CANCELLED`: `direction: 'DEDUCT'` for allocate, `direction: 'ADD'` for deallocate).

### API — Channel allocations

Base path: `/api/v1/channel-allocations`

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | Admin/User | List per-item allocation snapshots for a channel (`?channel=SHOPEE`) |
| POST | `/allocate` | Admin | Deduct RHET stock and increase channel allocated qty `{ inventoryId, channel?, quantity, remarks? }` |
| POST | `/deallocate` | Admin | Restore RHET stock and decrease channel allocated qty `{ inventoryId, channel?, quantity, remarks? }` |

## Fulfillment tracking board (Phase 2B)

The Online Orders page is now an **internal delivery tracker**, table-style with status tabs (not a kanban board, to reuse the existing responsive-table pattern). It is for admin/user staff only — there is no customer-facing tracking view.

`fulfillment_status` is a separate column from `order_status` (SKU matching). Moving an order across fulfillment columns never touches stock **except** the Return confirmation step.

| Column | Meaning |
|---|---|
| `PROCESSING` | Customer checked out on Shopee (default state) |
| `READY_TO_SHIP` | Seller admin confirmed/processed the order |
| `SHIPPED` | Handed to courier |
| `RECEIVED` | Customer received the item |
| `RETURN` | Return initiated, needs inspection |
| `RETURN_CONFIRMED` | Inventory admin finished inspection |

Allowed transitions: `PROCESSING → READY_TO_SHIP → SHIPPED → RECEIVED`, and `SHIPPED`/`RECEIVED → RETURN → RETURN_CONFIRMED` (return confirmation is its own endpoint, not a plain status move). Before the Shopee API is connected, an admin moves orders manually with buttons on the order detail modal. After Phase 4 connects the Shopee Order Status Push webhook, `fulfillment_status` will auto-update; manual override stays available.

### API — Fulfillment & returns

Base path: `/api/v1/online-orders`

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/:id/fulfillment-status` | Admin | Manually move an order forward `{ status }` (`READY_TO_SHIP`\|`SHIPPED`\|`RECEIVED`\|`RETURN`) |
| POST | `/:id/confirm-return` | Admin | Resolve a return `{ reusable: boolean, notes? }` — reusable restores RHET stock via `RETURN`, not reusable restores nothing |

## Phase 1 (implemented, superseded by allocation model above)

The original Phase 1 ingestion pipeline is unchanged and still used for order visibility:

1. Import Shopee order exports (CSV) or add orders manually
2. Match each Shopee line item to RHET inventory through `channel_sku_mappings`
3. Flag unmatched lines as `UNMATCHED` for admin review (order becomes `NEEDS_ATTENTION`)
4. Persist SKU mappings so future imports auto-resolve the same Shopee SKU

Historical orders imported before Phase 2B may still show `DEDUCTED`/`OVERSOLD` line statuses from the old `ONLINE_SALE` deduction path. These are read-only legacy states; `computeOrderStatus` treats `DEDUCTED` the same as `MATCHED` for backward compatibility, and cancel/restore logic still honors any legacy `movement_id` on those lines.

| Source | Auth | Notes |
|---|---|---|
| CSV import | Firebase admin | Upload Shopee Seller Centre order export |
| Manual order entry | Firebase admin | One-off order when live sync is unavailable |

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

Multiple CSV rows with the same order ID are grouped into one order with multiple line items.

## Matching rules (no stock effect)

1. Look up `channel_sku_mappings` by `(channel, external_sku)`
2. If no mapping exists, or the mapped item is inactive → line status `UNMATCHED`, order becomes `NEEDS_ATTENTION`
3. If mapping exists and is active → line status `MATCHED`
4. Order status is derived from line statuses:
   - all matched (or cancelled) with at least one matched → `FULFILLED`
   - any unmatched → `NEEDS_ATTENTION`
   - all cancelled → `CANCELLED`

Re-importing the same Shopee order ID is idempotent.

## Admin resolution workflow

When a line is `UNMATCHED`:

1. Open **Online Orders** → **Review**
2. Choose the RHET inventory item for that Shopee SKU
3. RHET saves the mapping and marks the line `MATCHED` (still no stock effect)

Future imports with the same Shopee SKU will auto-resolve through the saved mapping.

## REST API — Orders (Firebase auth)

Base path: `/api/v1/online-orders`

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | Admin/User | List online orders (`?status=`, `?fulfillmentStatus=`, `?channel=`, `?search=`) |
| GET | `/:id` | Admin/User | Order detail with line items |
| GET | `/mappings` | Admin/User | List channel SKU mappings |
| POST | `/import` | Admin | Import Shopee CSV text `{ csvText, channel? }` |
| POST | `/manual` | Admin | Create one manual order |
| POST | `/items/:id/resolve` | Admin | Map line item to inventory (visibility only) |
| POST | `/items/:id/cancel` | Admin | Cancel one line (restores stock only for legacy deducted lines) |
| POST | `/:id/cancel` | Admin | Cancel entire order (restores stock only for legacy deducted lines) |
| POST | `/:id/fulfillment-status` | Admin | Move order to the next fulfillment column |
| POST | `/:id/confirm-return` | Admin | Resolve a return (reusable/not reusable) |

## Database tables

- `online_orders` (now includes `fulfillment_status`, `return_reusable`, `return_notes`)
- `online_order_items`
- `channel_sku_mappings`
- `channel_stock_snapshots` (Phase 2B)
- `channel_allocation_logs` (Phase 2B)

Migrations: `backend/database/migrations/010_online_orders.sql`, `backend/database/migrations/011_channel_allocation_and_fulfillment.sql`

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
| Fulfillment status move rejected (409) | Skipping a column, e.g. `PROCESSING → RECEIVED` | Move through the columns in order, or use return flow |
| Return confirm rejected (409) | Order is not currently in the `RETURN` column | Move the order to `RETURN` first |

If your Shopee export uses different column names, share a sample file so the alias list in `online-order.service.js` can be updated.
