# Paste prompt — Scoring Shipping Management → RHET Manual Orders

Copy the fenced block into Scoring Cursor / engineering ticket.

**RHET must have applied migrations 032 + 033 and deployed the integrations Manual Orders routes.**

Human guide: [SCORING_SHIPPING_MANUAL_ORDERS.md](./SCORING_SHIPPING_MANUAL_ORDERS.md)

---

````markdown
## Task: Connect Scoring Shipping Management to RHET Manual Orders

### Goal
When Shipping Management moves Pending → Processing and Courier is NOT Shopee (Lalamove / Others):
1. Save locally as Processing
2. Call RHET from Scoring **backend** so the row appears on Inventory → Manual Orders
3. Inventory maps items from notes, marks Shipped (stock deducts)
4. Receive webhook → set Scoring to Shipped
5. Delivered syncs both ways

Shopee courier → do **not** call RHET Manual Orders.

### RHET
- UI: https://inventory.lca-app.com → Manual Orders
- API base: https://api-inventory.lca-app.com/api/v1/integrations
- Auth: `X-Integration-Key: <INVENTORY_API_KEY>`

### Scoring backend `.env` (never VITE_* / NEXT_PUBLIC_*)
```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_API_KEY=<paste from RHET API Keys>
INVENTORY_WEBHOOK_URL=https://<SCORING-API>/api/webhooks/inventory-shipping
```

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | /manual-orders | Create header-only order |
| GET | /manual-orders/:id | Poll |
| GET | /manual-orders/by-reference/:reference | Poll by externalReference |
| POST | /manual-orders/:id/fulfillment-status | `{ "status": "DELIVERED" }` or `"ERROR"` |
| POST | /manual-orders/by-reference/:reference/fulfillment-status | Same by reference |

### Create body (items must be empty)
```json
{
  "externalReference": "SCORINGSYSTEM-{transactionId}",
  "customerName": "{Receiver or Parent}",
  "customerPhone": "{Contact}",
  "shippingAddress": "{Address}",
  "courierName": "Lalamove",
  "studentName": "{Student}",
  "programName": "{Program}",
  "paymentDate": "YYYY-MM-DD",
  "notes": "Receiver's Name: …\nComplete Address: …\nContact Number: …",
  "webhookUrl": "<INVENTORY_WEBHOOK_URL>",
  "items": []
}
```

Rules:
- Unique `externalReference` (idempotent)
- `notes` max 2000 chars
- Do not send line items — RHET maps from notes
- `sourceSystem` ignored (from API key)
- Disable Shipped in Scoring UI for non-Shopee until `manual_order.shipped` webhook

### Webhooks to implement
- `manual_order.created`
- `manual_order.shipped` → Scoring Shipped
- `manual_order.delivered` → Scoring Delivered
- `manual_order.error` → Scoring Error

Match by `externalReference`. Respond 200. Idempotent.

### UI
1. Add Courier on Update Status (Shopee | Lalamove | Others)
2. Non-Shopee → require Remarks (receiver / address / phone)
3. Shopee → existing Order ID path only

### Test plan
1. Processing + Shopee → no RHET row
2. Processing + Lalamove → RHET Manual Orders Needs attention
3. Map items → Shipped → stock down + Scoring Shipped
4. Delivered both ways
5. Duplicate externalReference → one order
6. Bad key → 401
````
