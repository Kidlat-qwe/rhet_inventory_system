# Shopee Online Orders Integration

Phase 1 integration for tracking Shopee checkout orders inside RHET Inventory without changing the existing PSMS/CMS stock-request workflow.

## What this module does

1. Import Shopee order exports (CSV) or add orders manually
2. Match each Shopee line item to RHET inventory through `channel_sku_mappings`
3. Auto-deduct stock with `ONLINE_SALE` movements when stock is available
4. Flag unmatched or oversold lines as `NEEDS_ATTENTION` for admin review
5. Persist SKU mappings so future imports auto-resolve the same Shopee SKU

## Phase 1 (implemented now)

| Source | Auth | Notes |
|---|---|---|
| CSV import | Firebase admin | Upload Shopee Seller Centre order export |
| Manual order entry | Firebase admin | One-off order when live sync is unavailable |

## Phase 2 (future, not implemented yet)

| Source | Auth | Notes |
|---|---|---|
| Shopee Push Mechanism webhook | Shopee signature | Requires approved Shopee Partner App |
| Shopee REST API polling | OAuth shop token | Fallback if webhook delivery fails |

Phase 2 will call the same ingestion service used by CSV/manual import. No schema changes are expected.

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

## Matching and stock rules

1. Look up `channel_sku_mappings` by `(channel, external_sku)`
2. If no mapping exists → line status `UNMATCHED`, order may become `NEEDS_ATTENTION`
3. If mapping exists but stock is insufficient → line status `OVERSOLD`
4. If mapping exists and stock is sufficient → create `ONLINE_SALE` movement and mark line `DEDUCTED`
5. Order status is derived from line statuses:
   - all deducted (or cancelled) non-cancelled lines deducted → `FULFILLED`
   - any unmatched/oversold → `NEEDS_ATTENTION`
   - all cancelled → `CANCELLED`

Re-importing the same Shopee order ID is idempotent. Already deducted lines are not deducted again.

## Admin resolution workflow

When a line is `UNMATCHED` or `OVERSOLD`:

1. Open **Online Orders** → **Review**
2. Choose the RHET inventory item for that Shopee SKU
3. RHET saves the mapping and retries stock deduction for that line only

Future imports with the same Shopee SKU will auto-resolve through the saved mapping.

## REST API (Firebase auth)

Base path: `/api/v1/online-orders`

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | Admin/User | List online orders |
| GET | `/:id` | Admin/User | Order detail with line items |
| GET | `/mappings` | Admin/User | List channel SKU mappings |
| POST | `/import` | Admin | Import Shopee CSV text `{ csvText, channel? }` |
| POST | `/manual` | Admin | Create one manual order |
| POST | `/items/:id/resolve` | Admin | Map line item to inventory and retry deduction |
| POST | `/items/:id/cancel` | Admin | Cancel one line and restore stock if deducted |
| POST | `/:id/cancel` | Admin | Cancel entire order and restore deducted stock |

## Example CSV import

```http
POST /api/v1/online-orders/import
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "csvText": "Order ID,Username (Buyer),Order Creation Date,SKU Reference No.,Product Name,Variation Name,Quantity,Deal Price,Order Total\n220101ABCDEF,buyer_one,2026-01-15 10:00,SHP-UNI-01,PE Uniform,Boys · Small · 28,2,450.00,900.00",
  "channel": "SHOPEE"
}
```

## Database tables

- `online_orders`
- `online_order_items`
- `channel_sku_mappings`

Migration: `backend/database/migrations/010_online_orders.sql`

## Relationship to PSMS integration

| Feature | PSMS/CMS | Shopee Online Orders |
|---|---|---|
| Direction | External system pushes requests into RHET | RHET ingests marketplace orders |
| Auth | Integration API key | Firebase admin (Phase 1) |
| Approval | Manual approve/reject | Auto-deduct with attention flags |
| Stock movement | `RELEASED` | `ONLINE_SALE` |
| Outbound webhook | Yes | No (Phase 1) |

Both modules share the same inventory balances and movement audit trail.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Import fails on row X | Missing order ID or quantity | Fix CSV row or export format |
| All lines unmatched | No SKU mappings yet | Map lines from Online Orders detail modal |
| Line oversold | Warehouse stock lower than Shopee quantity | Add stock or cancel/adjust the order line |
| Duplicate import ignored for deducted lines | Idempotent re-import | Expected behavior |

If your Shopee export uses different column names, share a sample file so the alias list in `online-order.service.js` can be updated.
