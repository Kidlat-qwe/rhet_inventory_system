# PSMS ↔ RHET Inventory API Integration Guide

Use this document when setting up PSMS to connect with the **RHET Centralized Inventory Management System**.

---

## 1. How the integration works

```text
┌─────────────────────┐         ┌──────────────────────────┐         ┌─────────────────────┐
│  PSMS Frontend      │         │  PSMS Backend            │         │  RHET Inventory API │
│  (Merchandise form) │ ──────► │  /api/merchandise/...    │ ──────► │  /integrations/...  │
└─────────────────────┘         └──────────────────────────┘         └─────────────────────┘
                                           ▲                                      │
                                           │         webhook (optional)          │
                                           └──────────────────────────────────────┘

1. User fills merchandise request form in PSMS
2. PSMS backend sends request to RHET Inventory
3. RHET admin approves in Stock Requests page
4. Inventory auto-deducts stock
5. Inventory notifies PSMS via webhook (optional)
```

**Rules**

- PSMS **backend** calls inventory API (never call from browser/frontend).
- PSMS does **not** need SKU.
- PSMS does **not** use Firebase login.
- Stock is deducted only after RHET inventory admin **approves** the request.

---

## 2. What to configure on RHET Inventory (one-time)

In the RHET Inventory admin UI, open **Management → API Keys**:

1. Select **PSMS** (or click **Add integration** for a new system).
2. Enter the system name `PSMS` (or your integration system name) and click **Generate API key**.
3. Copy the key immediately — it is shown only once.
4. Give that key to the PSMS backend team.

The external system must send the key on every request:

```http
X-Integration-Key: rhet_psms_xxxxxxxxxxxxxxxx
```

Optional: set a default webhook in the integration card, or in inventory `backend/.env`:

```env
PSMS_WEBHOOK_URL=https://your-psms-domain.com/api/webhooks/inventory
```

Note: legacy `PSMS_INTEGRATION_KEY` env-based API auth is disabled in this version. New setups must use keys generated in RHET Inventory → **API Keys**.

**Inventory base URL**

| Environment | URL |
|---|---|
| Local | `http://localhost:3000/api/v1/integrations` |
| Production | `https://your-inventory-domain.com/api/v1/integrations` |

---

## 3. What to configure on PSMS

### 3.1 Environment variables

Add to PSMS backend `.env`:

```env
# RHET Inventory integration
INVENTORY_API_URL=http://localhost:3000/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_psms_paste-key-from-inventory-api-keys-page
INVENTORY_WEBHOOK_URL=http://localhost:YOUR_PSMS_PORT/api/webhooks/inventory
```

| Variable | Description |
|---|---|
| `INVENTORY_API_URL` | RHET Inventory integration base URL |
| `INVENTORY_INTEGRATION_KEY` | API key generated in RHET Inventory → API Keys |
| `INVENTORY_WEBHOOK_URL` | PSMS endpoint that receives status updates from inventory |

### 3.2 Required PSMS backend routes

Create these routes in PSMS:

| PSMS route | Purpose |
|---|---|
| `GET /api/merchandise/catalog` | Proxy to inventory catalog for dropdowns |
| `GET /api/merchandise/availability` | Proxy to check stock before submit |
| `POST /api/merchandise/stock-requests` | Submit form to inventory |
| `GET /api/merchandise/stock-requests/:id` | Check request status |
| `POST /api/webhooks/inventory` | Receive approve/reject notifications |

### 3.3 Recommended PSMS database table

Store each submitted request in PSMS:

```sql
CREATE TABLE merchandise_stock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_request_id UUID,
  external_reference VARCHAR(100) UNIQUE,
  requested_by VARCHAR(150) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20),
  item_type VARCHAR(50),
  size_label VARCHAR(20),
  quantity INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  matched_sku VARCHAR(64),
  rejection_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Authentication

Every request from PSMS backend to inventory must include **one** of:

```http
X-Integration-Key: your-long-random-shared-secret
```

or

```http
Authorization: Bearer your-long-random-shared-secret
```

Also send:

```http
Content-Type: application/json
```

---

## 5. Inventory API endpoints

### 5.1 Get catalog (populate dropdowns)

```http
GET {INVENTORY_API_URL}/catalog
X-Integration-Key: {INVENTORY_INTEGRATION_KEY}
```

**Success response**

```json
{
  "success": true,
  "data": {
    "categories": [
      { "categoryId": "uuid", "categoryName": "School Uniform" },
      { "categoryId": "uuid", "categoryName": "PE Uniform" }
    ],
    "items": [
      {
        "inventoryId": "uuid",
        "sku": "SCH-M-SHIRT-M",
        "itemName": "Classic White Polo",
        "stocks": 48,
        "status": "ACTIVE",
        "variation": "Male · Shirt · M",
        "categoryName": "School Uniform"
      }
    ]
  }
}
```

**Use in PSMS form**

| PSMS field | Source |
|---|---|
| Items (category dropdown) | `data.categories[].categoryName` |
| Gender | Fixed: `Male`, `Female`, `Unisex` |
| Type (School Uniform) | `Polo`, `Short`, `Full Set` |
| Type (PE Uniform) | `Shirt`, `Pants`, `Full Set` |
| Size | Fixed: `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL` |

`Full Set` means shirt and pants share the same size (stored as e.g. `Male · Full Set · M`).

---

### 5.2 Check availability (optional)

```http
GET {INVENTORY_API_URL}/availability?categoryName=School%20Uniform&gender=Male&type=Shirt&size=M
X-Integration-Key: {INVENTORY_INTEGRATION_KEY}
```

**Query parameters**

| Parameter | Required | Example |
|---|---|---|
| `categoryName` | Yes | `School Uniform` |
| `gender` | For uniform categories | `Male` |
| `type` | For uniform categories | `Shirt` |
| `size` | For uniform categories | `M` |
| `itemName` | For non-uniform categories | `School Backpack` |

**Success response**

```json
{
  "success": true,
  "data": {
    "available": true,
    "stocks": 48,
    "status": "ACTIVE",
    "sku": "SCH-M-SHIRT-M",
    "itemName": "Classic White Polo",
    "variation": "Male · Shirt · M",
    "inventoryId": "uuid"
  }
}
```

---

### 5.3 Submit stock request(s)

```http
POST {INVENTORY_API_URL}/stock-requests
X-Integration-Key: {INVENTORY_INTEGRATION_KEY}
Content-Type: application/json
```

**Request body**

```json
{
  "requestDate": "2026-07-16",
  "requestedBy": "Paul Camus",
  "reason": "Restock campus store display",
  "webhookUrl": "http://localhost:5000/api/webhooks/inventory",
  "batchReference": "PSMS-BATCH-2026-001",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Shirt",
      "size": "M",
      "quantity": 2,
      "externalReference": "PSMS-REQ-1001"
    },
    {
      "categoryName": "PE Uniform",
      "gender": "Female",
      "type": "Pants",
      "size": "L",
      "quantity": 1,
      "externalReference": "PSMS-REQ-1002"
    }
  ]
}
```

**Field mapping from PSMS merchandise form**

| PSMS form field | JSON field |
|---|---|
| Request Date | `requestDate` |
| Requested By | `requestedBy` |
| Reason for Request | `reason` |
| Items (category) | `items[].categoryName` |
| Gender | `items[].gender` |
| Type | `items[].type` |
| Size | `items[].size` |
| Quantity | `items[].quantity` |

**Notes**

- Each table row = one object in `items[]`.
- Each row becomes a **separate pending request** in inventory.
- `reason` applies to all rows in the same submission.
- `externalReference` should be unique per row (use your PSMS request ID).
- `webhookUrl` is optional if `PSMS_WEBHOOK_URL` is set on inventory server.

**Success response (201)**

```json
{
  "success": true,
  "data": [
    {
      "requestId": "b1c2d3e4-....",
      "externalReference": "PSMS-REQ-1001",
      "status": "PENDING",
      "categoryName": "School Uniform",
      "gender": "Male",
      "itemType": "Shirt",
      "sizeLabel": "M",
      "quantity": 2
    }
  ],
  "meta": {
    "count": 1
  }
}
```

**Save in PSMS**

- `requestId` → `inventory_request_id`
- `externalReference` → your PSMS reference
- `status` → `PENDING`

---

### 5.4 Get request status (polling)

```http
GET {INVENTORY_API_URL}/stock-requests/{requestId}
X-Integration-Key: {INVENTORY_INTEGRATION_KEY}
```

**Success response**

```json
{
  "success": true,
  "data": {
    "requestId": "uuid",
    "externalReference": "PSMS-REQ-1001",
    "status": "FULFILLED",
    "requestedBy": "Paul Camus",
    "categoryName": "School Uniform",
    "gender": "Male",
    "itemType": "Shirt",
    "sizeLabel": "M",
    "quantity": 2,
    "matchedSku": "SCH-M-SHIRT-M",
    "processedAt": "2026-07-16T08:00:00.000Z"
  }
}
```

**Status values**

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for inventory admin approval |
| `FULFILLED` | Approved and stock deducted |
| `REJECTED` | Admin rejected the request |
| `FAILED` | Could not match item or process request |

---

## 6. Item matching (no SKU required)

### Uniform-like categories

Applies to: `Uniform`, `PE Uniform`, `School Uniform`, and any category ending with ` Uniform`.

Inventory matches using:

```text
categoryName + gender + type + size
```

This maps to inventory variation:

```text
Male · Shirt · M
```

**Example**

| PSMS sends | Inventory looks for |
|---|---|
| `School Uniform`, `Male`, `Shirt`, `M` | Variation = `Male · Shirt · M` |

### Non-uniform categories (Bag, Book, Accessory, etc.)

Send `itemName` instead of gender/type/size:

```json
{
  "categoryName": "Bag",
  "itemName": "School Backpack",
  "quantity": 1,
  "externalReference": "PSMS-REQ-2001"
}
```

---

## 7. Webhook setup (recommended)

Inventory sends POST requests to PSMS when request status changes.

### 7.1 Create PSMS webhook route

```text
POST /api/webhooks/inventory
```

### 7.2 Webhook payload example

```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "PSMS-REQ-1001",
  "sourceSystem": "PSMS",
  "status": "FULFILLED",
  "requestedBy": "Paul Camus",
  "reason": "Restock campus store display",
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Shirt",
  "size": "M",
  "quantity": 2,
  "matchedSku": "SCH-M-SHIRT-M",
  "inventoryId": "uuid",
  "rejectionReason": null,
  "failureReason": null,
  "processedAt": "2026-07-16T08:00:00.000Z",
  "timestamp": "2026-07-16T08:00:01.000Z"
}
```

### 7.3 Webhook events

| Event | When |
|---|---|
| `stock_request.created` | Request saved as `PENDING` |
| `stock_request.fulfilled` | Admin approved; stock deducted |
| `stock_request.rejected` | Admin rejected request |

### 7.4 PSMS webhook handler logic

1. Receive POST body.
2. Find PSMS record by `requestId` or `externalReference`.
3. Update local status.
4. Optionally notify the requester in PSMS UI.
5. Return HTTP `200`.

---

## 8. PSMS backend example (Node.js)

### 8.1 Inventory client service

```javascript
// services/inventoryClient.js

const BASE_URL = process.env.INVENTORY_API_URL
const INTEGRATION_KEY = process.env.INVENTORY_INTEGRATION_KEY

async function inventoryRequest(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': INTEGRATION_KEY,
      ...options.headers,
    },
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Inventory API request failed')
  }
  return payload
}

export async function getCatalog() {
  return inventoryRequest('/catalog')
}

export async function checkAvailability(query) {
  const params = new URLSearchParams(query)
  return inventoryRequest(`/availability?${params.toString()}`)
}

export async function submitStockRequest(body) {
  return inventoryRequest('/stock-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getStockRequestStatus(requestId) {
  return inventoryRequest(`/stock-requests/${requestId}`)
}
```

### 8.2 Submit route example

```javascript
// routes/merchandise.js

import { submitStockRequest } from '../services/inventoryClient.js'

app.post('/api/merchandise/stock-requests', async (req, res) => {
  try {
    const { requestDate, requestedBy, reason, items } = req.body

    const payload = {
      requestDate,
      requestedBy,
      reason,
      webhookUrl: process.env.INVENTORY_WEBHOOK_URL,
      items: items.map((row, index) => ({
        categoryName: row.categoryName,
        gender: row.gender,
        type: row.type,
        size: row.size,
        quantity: Number(row.quantity),
        externalReference: row.externalReference || `PSMS-${Date.now()}-${index + 1}`,
      })),
    }

    const result = await submitStockRequest(payload)

    // TODO: save result.data rows to PSMS database

    res.status(201).json({ success: true, data: result.data })
  } catch (error) {
    res.status(502).json({ success: false, error: { message: error.message } })
  }
})
```

### 8.3 Webhook route example

```javascript
app.post('/api/webhooks/inventory', async (req, res) => {
  const payload = req.body

  // TODO: update PSMS database by payload.requestId or payload.externalReference
  // TODO: notify user if payload.status === 'FULFILLED' or 'REJECTED'

  res.json({ success: true })
})
```

---

## 9. PSMS frontend flow

1. Open **Request Merchandise Stock** modal.
2. Call `GET /api/merchandise/catalog` to load category dropdown.
3. When user selects category + gender + type + size, optionally call availability API.
4. User clicks **Submit Request**.
5. Frontend calls `POST /api/merchandise/stock-requests` (PSMS backend only).
6. Show success message: “Request submitted — pending inventory approval.”
7. Show status in PSMS request history page.

**Do not** call RHET Inventory directly from the browser.

---

## 10. Error handling

**Standard error response from inventory**

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 3 unit(s) are available"
  }
}
```

**Common error codes**

| Code | Meaning | PSMS action |
|---|---|---|
| `INTEGRATION_UNAUTHORIZED` | Wrong/missing API key | Check env variables |
| `INTEGRATION_DISABLED` | Inventory integration not configured | Contact inventory admin |
| `VALIDATION_ERROR` | Invalid request body | Fix form validation |
| `ITEM_NOT_MATCHED` | No matching inventory item | Show “item not available in inventory” |
| `INSUFFICIENT_STOCK` | Not enough stock on approval | Show error to admin/user |

---

## 11. Testing checklist

### On RHET Inventory

- [ ] Backend running (default: `http://localhost:3000`)
- [ ] `PSMS_INTEGRATION_KEY` set in inventory `.env`
- [ ] Inventory items exist for test combinations (e.g. School Uniform, Male · Shirt · M)
- [ ] Stock quantity > 0 for test items

### On PSMS

- [ ] `INVENTORY_API_URL` and `INVENTORY_INTEGRATION_KEY` set
- [ ] Backend proxy routes created
- [ ] Merchandise form submits to PSMS backend
- [ ] PSMS stores `requestId` and `externalReference`
- [ ] Webhook route created (optional)

### End-to-end test

1. Submit request from PSMS form.
2. Verify request appears in RHET Inventory → **Stock Requests** as `PENDING`.
3. Approve request in RHET Inventory.
4. Verify stock deducted in RHET Inventory.
5. Verify PSMS status updated to `FULFILLED` (webhook or polling).

---

## 12. Production checklist

- [ ] Use HTTPS for both systems
- [ ] Use a long random shared key (not the dev default)
- [ ] Store integration key in server env/secrets only
- [ ] Never expose integration key in PSMS frontend
- [ ] Category names in PSMS must exactly match inventory categories
- [ ] Enable webhook or polling for status sync
- [ ] Log all integration requests in PSMS for debugging

---

## 13. Quick reference

| Action | Method | URL |
|---|---|---|
| Get catalog | `GET` | `/catalog` |
| Check availability | `GET` | `/availability?...` |
| Submit request | `POST` | `/stock-requests` |
| Get request status | `GET` | `/stock-requests/:id` |

**Base URL:** `{INVENTORY_API_URL}`  
**Auth header:** `X-Integration-Key: {INVENTORY_INTEGRATION_KEY}`

---

## 14. Support contacts

| System | Responsibility |
|---|---|
| PSMS team | Form UI, PSMS backend routes, webhook handler, local request storage |
| RHET Inventory team | Stock data, admin approval, stock deduction, integration key |

## 15. Connected Systems admin page

After PSMS is configured, inventory admins can verify the connection in the RHET Inventory UI:

**Management → Connected Systems**

| Status | Meaning |
|---|---|
| **Not configured** | `PSMS_INTEGRATION_KEY` is missing on the inventory server |
| **Ready** | API key is set, but PSMS has not called the API yet |
| **Connected** | PSMS has successfully called the integration API |

The page also shows total/pending/fulfilled requests and the webhook URL per system.

For technical API reference inside the inventory repository, see:

```text
backend/integrations/README.md
```
