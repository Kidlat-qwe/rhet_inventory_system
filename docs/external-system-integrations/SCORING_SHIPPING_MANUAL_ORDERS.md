# Scoring Shipping Management → Manual Orders

**Audience:** Scoring engineering (Performance Management / Shipping Management) + RHET Inventory.

**Not for CMS/PSMS stock requests.** Use [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) for campus restock.

---

## Flow

```text
Scoring: Pending → Update Status → Processing + Courier ≠ Shopee
  → Scoring backend POST /integrations/manual-orders
  → RHET Manual Orders (Needs attention until items mapped)
  → Inventory maps items → Processing → Shipped (stock − MANUAL_SALE)
  → Webhook manual_order.shipped → Scoring Shipped
  → Delivered either side (both ways)
```

Shopee courier → **do not** call this API.

---

## Scoring backend `.env`

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_API_KEY=rhet_<system>_<secret>
INVENTORY_WEBHOOK_URL=https://<scoring-api>/api/webhooks/inventory-shipping
```

Auth header: `X-Integration-Key: <INVENTORY_API_KEY>`  
(`INVENTORY_INTEGRATION_KEY` is an accepted alias name in docs; send the same value.)

Local RHET: `INVENTORY_API_URL=http://localhost:3000/api/v1/integrations`

---

## API (all under `/api/v1/integrations`, require integration key)

| Method | Path | Purpose |
|---|---|---|
| POST | `/manual-orders` | Create header-only order (idempotent on `externalReference`) |
| GET | `/manual-orders/:id` | Poll by RHET order id |
| GET | `/manual-orders/by-reference/:reference` | Poll by `externalReference` |
| POST | `/manual-orders/:id/fulfillment-status` | Scoring sets `{ "status": "DELIVERED" \| "ERROR" }` |
| POST | `/manual-orders/by-reference/:reference/fulfillment-status` | Same by reference |

### POST `/manual-orders` body

```json
{
  "externalReference": "SCORINGSYSTEM-12389",
  "customerName": "Abegail Hernandez",
  "customerPhone": "09XXXXXXXXX",
  "shippingAddress": "Complete address…",
  "courierName": "Lalamove",
  "studentName": "Mikhail Cruz",
  "programName": "Guiguinto - Kindergarten",
  "paymentDate": "2026-08-08",
  "notes": "Receiver's Name: …\nComplete Address: …\nContact Number: …",
  "webhookUrl": "https://score…/api/webhooks/inventory-shipping",
  "items": []
}
```

| Field | Required | Notes |
|---|---|---|
| `externalReference` | Yes | Unique; prefer `{SYSTEM_CODE}-{transactionId}` |
| `customerName` | Yes | Receiver / parent |
| `customerPhone` | No | Max 40 |
| `shippingAddress` | No | Max 500 |
| `courierName` | No | e.g. Lalamove |
| `notes` | No | Max **2000** (Remarks) |
| `studentName` / `programName` / `paymentDate` | No | Display on Manual Orders board |
| `webhookUrl` | Recommended | Else client default webhook from API Keys |
| `items` | Must be empty | Warehouse maps SKUs in RHET UI |
| `sourceSystem` | Ignored | Taken from API key |

Response `201`: Manual Order object (`orderId`, `orderNumber`, `fulfillmentStatus: NEEDS_ATTENTION`, …).  
Re-POST same `externalReference` → same order (idempotent).

---

## Webhooks (RHET → Scoring)

RHET POSTs JSON to `webhookUrl`.

| Event | When |
|---|---|
| `manual_order.created` | Order saved in RHET |
| `manual_order.shipped` | Inventory marked Shipped (stock deducted) |
| `manual_order.delivered` | Inventory (or Scoring) marked Delivered |
| `manual_order.error` | Cancelled / Error before ship |

Important payload fields: `event`, `orderId`, `orderNumber`, `externalReference`, `fulfillmentStatus`, `courierName`, `processedBy`, `timestamp`.

Respond **HTTP 200** quickly. Idempotent handling required.

---

## Status rules

| Action | Owner |
|---|---|
| Create (Processing + non-Shopee) | Scoring |
| Map items | RHET Manual Orders UI |
| Shipped | **RHET only** (Scoring must disable Shipped until webhook) |
| Delivered | Both ways |
| Error (pre-ship) | Both (RHET cancel or Scoring `ERROR`) |

---

## Migrations

- `032_manual_orders_shipping_status.sql` — Shipping Management statuses + Scoring columns  
- `033_manual_orders_webhook.sql` — `webhook_url` + notes length 2000  

Run: `cd backend && npm run db:migrate`
