# PSMS Integration

Connect the PSMS merchandise page to RHET Inventory using machine-to-machine API calls.

**PSMS setup guide (paste into PSMS project):** [PSMS_API_INTEGRATION.md](./PSMS_API_INTEGRATION.md)

## Authentication

Set a shared secret in the inventory backend:

```env
PSMS_INTEGRATION_KEY=your-long-random-secret
PSMS_WEBHOOK_URL=https://your-psms-domain.com/api/webhooks/inventory
```

Every PSMS request must include:

```http
X-Integration-Key: your-long-random-secret
```

or

```http
Authorization: Bearer your-long-random-secret
```

## Base URL

```text
http://localhost:3000/api/v1/integrations
```

## Endpoints

### Catalog (populate PSMS dropdowns)

```http
GET /catalog
```

Returns active categories and inventory rows (no SKU required on PSMS side).

### Check availability

```http
GET /availability?categoryName=School%20Uniform&gender=Male&type=Shirt&size=M
```

### Submit stock request(s)

Each row in the PSMS form becomes one request record.

```http
POST /stock-requests
Content-Type: application/json

{
  "requestDate": "2026-07-16",
  "requestedBy": "Paul Camus",
  "reason": "Restock campus store display",
  "webhookUrl": "https://psms.example.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Shirt",
      "size": "M",
      "quantity": 2,
      "externalReference": "PSMS-REQ-1001"
    }
  ]
}
```

### Track request status

```http
GET /stock-requests/{requestId}
```

## Matching without SKU

Uniform-like categories (`Uniform`, `PE Uniform`, `School Uniform`, etc.) are matched using:

```text
Category + Gender + Type + Size
```

This maps to inventory `variation`:

```text
Male · Shirt · M
```

Other categories can send `itemName` instead of gender/type/size.

## Workflow

1. PSMS submits request → status `PENDING`
2. Inventory admin opens **Stock Requests** in RHET Inventory
3. Admin approves → stock is deducted (`RELEASED` movement) → status `FULFILLED`
4. Inventory sends webhook to PSMS

## Webhook events

| Event | When |
|---|---|
| `stock_request.created` | Request stored |
| `stock_request.fulfilled` | Admin approved and stock deducted |
| `stock_request.rejected` | Admin rejected |

Example payload:

```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "PSMS-REQ-1001",
  "status": "FULFILLED",
  "requestedBy": "Paul Camus",
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Shirt",
  "size": "M",
  "quantity": 2,
  "matchedSku": "SCH-M-SHIRT-M",
  "processedAt": "2026-07-16T08:00:00.000Z"
}
```

## PSMS example (Node.js)

```javascript
const INVENTORY_URL = 'http://localhost:3000/api/v1/integrations'
const INTEGRATION_KEY = process.env.PSMS_INTEGRATION_KEY

async function submitStockRequest(form) {
  const response = await fetch(`${INVENTORY_URL}/stock-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': INTEGRATION_KEY,
    },
    body: JSON.stringify({
      requestDate: form.requestDate,
      requestedBy: form.requestedBy,
      reason: form.reason,
      items: form.items.map((row, index) => ({
        categoryName: row.categoryName,
        gender: row.gender,
        type: row.type,
        size: row.size,
        quantity: Number(row.quantity),
        externalReference: row.externalReference || `${form.batchId}-${index + 1}`,
      })),
    }),
  })

  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || 'Inventory request failed')
  return payload.data
}
```

## Admin actions

| Action | Endpoint |
|---|---|
| List requests | `GET /api/v1/stock-requests` (Firebase admin auth) |
| Approve | `POST /api/v1/stock-requests/:id/approve` |
| Reject | `POST /api/v1/stock-requests/:id/reject` |

Approving automatically deducts stock. Rejecting notifies PSMS via webhook only.
