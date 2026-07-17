# External System ↔ RHET Inventory Integration Guide

Generic guide for connecting **any** external system (PSMS, HR, vendor portal, another school app, etc.) to the **RHET Centralized Inventory Management System**.

For a PSMS-specific walkthrough, see [PSMS_API_INTEGRATION.md](./PSMS_API_INTEGRATION.md).

---

## 1. How the integration works

```text
┌─────────────────────┐         ┌──────────────────────────┐         ┌─────────────────────┐
│  External Frontend  │         │  External Backend        │         │  RHET Inventory API │
│  (request form)     │ ──────► │  (proxies + local save)  │ ──────► │  /integrations/...  │
└─────────────────────┘         └──────────────────────────┘         └─────────────────────┘
                                           ▲                                      │
                                           │         webhook (optional)          │
                                           └──────────────────────────────────────┘

1. User submits a stock/merchandise request in the external system UI
2. External backend saves locally (optional) and calls RHET Inventory
3. RHET admin/user reviews the request under Stock Requests
4. On approve, RHET deducts inventory stock
5. RHET notifies the external system via webhook (optional)
```

**Rules**

- Call RHET from the **external system backend only** (never from the browser).
- The external system does **not** need SKUs for uniforms.
- The external system does **not** use Firebase login for this API.
- Stock is deducted only after someone approves the request in RHET Inventory.
- Each external system gets its **own API key** in RHET → **API Keys**.

---

## 2. What to configure on RHET Inventory (one-time per system)

1. Sign in to RHET Inventory as Admin.
2. Open **Management → API Keys**.
3. Click **Generate API key**.
4. Enter a system name (e.g. `PSMS`, `HR`, `VENDOR`).
5. Choose expiration (`7 days`, `1 month`, or `No expiration`).
6. Copy the modal values immediately:

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_API_KEY=rhet_<system>_<secret>
```

7. Paste them into the **external system backend** environment (Coolify / `.env`).

Every request from that system must send:

```http
X-Integration-Key: rhet_<system>_<secret>
```

or

```http
Authorization: Bearer rhet_<system>_<secret>
```

**Inventory base URL**

| Environment | URL |
|---|---|
| Local | `http://localhost:3000/api/v1/integrations` |
| Production (LCA Coolify) | `https://api-inventory.lca-app.com/api/v1/integrations` |

---

## 3. What to configure on the external system

### 3.1 Backend environment variables

```env
# RHET Inventory integration (backend only — never VITE_* / NEXT_PUBLIC_*)
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_xxxx_paste-key-from-inventory-api-keys-page
INVENTORY_WEBHOOK_URL=https://your-external-api-domain.com/api/webhooks/inventory
```

| Variable | Description |
|---|---|
| `INVENTORY_API_URL` | RHET Inventory integration base URL |
| `INVENTORY_INTEGRATION_KEY` | API key generated in RHET → API Keys |
| `INVENTORY_WEBHOOK_URL` | This system's endpoint that receives approve/reject callbacks |

Optional fallback alias:

```env
INVENTORY_API_KEY=<same value as INVENTORY_INTEGRATION_KEY>
```

### 3.2 Recommended backend routes (proxy pattern)

| External route | Purpose |
|---|---|
| `GET /.../catalog` | Proxy to RHET `/catalog` for dropdowns |
| `GET /.../availability` | Proxy to RHET `/availability` |
| `POST /.../stock-requests` | Save locally (optional) + submit to RHET |
| `GET /.../stock-requests/:id` | Check request status |
| `POST /api/webhooks/inventory` | Receive RHET status webhooks |

### 3.3 Recommended local tracking columns / table

Store enough to reconcile with RHET:

```sql
-- Example columns on your local request table
inventory_request_id UUID NULL,          -- RHET request UUID
external_reference VARCHAR(100) UNIQUE,  -- e.g. PSMS-123 / HR-45
inventory_sync_status VARCHAR(20),       -- PENDING / SYNCED / FAILED
inventory_sync_error VARCHAR(500)
```

---

## 4. Authentication

Every call to RHET must include **one** of:

```http
X-Integration-Key: <INVENTORY_INTEGRATION_KEY>
```

```http
Authorization: Bearer <INVENTORY_INTEGRATION_KEY>
```

---

## 5. API endpoints

Base path: `{INVENTORY_API_URL}`

### 5.1 Catalog

```http
GET /catalog
X-Integration-Key: <key>
```

Returns active categories and inventory rows for building forms.

### 5.2 Availability

```http
GET /availability?categoryName=School%20Uniform&gender=Male&type=Shirt&size=M
X-Integration-Key: <key>
```

### 5.3 Submit stock request(s)

```http
POST /stock-requests
Content-Type: application/json
X-Integration-Key: <key>
```

```json
{
  "requestDate": "2026-07-17",
  "requestedBy": "Requester Name",
  "reason": "Why stock is needed",
  "webhookUrl": "https://your-external-api-domain.com/api/webhooks/inventory",
  "batchReference": "OPTIONAL-BATCH-ID",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Shirt",
      "size": "XS",
      "quantity": 10,
      "itemName": "Optional for non-uniform items",
      "externalReference": "PSMS-123"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `categoryName` | Must match RHET category (e.g. `School Uniform`, `PE Uniform`) |
| `gender` / `type` / `size` | Required for uniform-like matching |
| `itemName` | Useful for non-uniform items |
| `externalReference` | Unique per row; use `<SYSTEM_CODE>-<local-id>` |
| `webhookUrl` | Optional if a default webhook is configured for the client |

### 5.4 Get request by id

```http
GET /stock-requests/{requestId}
X-Integration-Key: <key>
```

---

## 6. Matching rules (no SKU required)

Uniform-like categories (`School Uniform`, `PE Uniform`, etc.) match by:

```text
categoryName + gender + type + size
```

Example RHET variation:

```text
Male · Shirt · XS
```

Map UI labels before calling RHET:

| External UI | RHET value |
|---|---|
| Men / Male | `Male` |
| Women / Female | `Female` |
| Unisex | `Unisex` |
| Top / Shirt / Polo | `Shirt` or `Polo` |
| Pants / Short | `Pants` / `Short` |
| Full Set | `Full Set` |
| Extra Small | `XS` |
| Small / Medium / Large | `S` / `M` / `L` |
| Extra Large / 2XL / 3XL | `XL` / `2XL` / `3XL` |

---

## 7. Implementation checklist

1. **Create** `services/inventoryClient.js` (or equivalent):
   - Read `INVENTORY_API_URL`, `INVENTORY_INTEGRATION_KEY` (or `INVENTORY_API_KEY`), `INVENTORY_WEBHOOK_URL`
   - Expose `getCatalog()`, `checkAvailability()`, `submitStockRequests()`, `getStockRequest()`
   - Throw clear errors if env is missing or RHET returns non-2xx

2. **On local request create**:
   - Call RHET `POST /stock-requests`
   - Set `externalReference` = `<SYSTEM_CODE>-<local_id>`
   - Store returned RHET `requestId`
   - If RHET fails: do **not** silently succeed — mark sync failed or roll back

3. **Add webhook receiver**:
   - `POST /api/webhooks/inventory`
   - Handle `stock_request.created`, `stock_request.fulfilled`, `stock_request.rejected`
   - Match by `externalReference` or stored `inventory_request_id`
   - Update local status; do not invent RHET stock into local stock unless that is explicit business logic

4. **Optional proxy routes** for the frontend (frontend never holds the API key)

5. **Update** external `.env.example` with the three inventory variables

---

## 8. Webhook events

| Event | When |
|---|---|
| `stock_request.created` | Request stored in RHET |
| `stock_request.fulfilled` | Approved and stock deducted |
| `stock_request.rejected` | Rejected in RHET |

Example payload:

```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "PSMS-123",
  "status": "FULFILLED",
  "requestedBy": "Requester Name",
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Shirt",
  "size": "XS",
  "quantity": 10,
  "matchedSku": "SCH-M-SHIRT-XS",
  "processedAt": "2026-07-17T08:00:00.000Z"
}
```

---

## 9. Example client (Node.js)

```javascript
const BASE_URL = process.env.INVENTORY_API_URL
const INTEGRATION_KEY =
  process.env.INVENTORY_INTEGRATION_KEY || process.env.INVENTORY_API_KEY

async function submitStockRequest(form) {
  const response = await fetch(`${BASE_URL}/stock-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': INTEGRATION_KEY,
    },
    body: JSON.stringify({
      requestDate: form.requestDate,
      requestedBy: form.requestedBy,
      reason: form.reason,
      webhookUrl: process.env.INVENTORY_WEBHOOK_URL,
      items: form.items.map((row, index) => ({
        categoryName: row.categoryName,
        gender: row.gender,
        type: row.type,
        size: row.size,
        quantity: Number(row.quantity),
        externalReference:
          row.externalReference || `${form.systemCode}-${form.localId || index + 1}`,
      })),
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Inventory request failed')
  }
  return payload.data
}
```

---

## 10. RHET admin actions (inventory UI / authenticated API)

| Action | Where |
|---|---|
| List requests | RHET UI → **Stock Requests**, or `GET /api/v1/stock-requests` (Firebase auth) |
| Approve | Approves and deducts stock |
| Reject | Rejects and sends webhook only |

---

## 11. Acceptance test

1. Generate an API key in RHET for this system (`PSMS`, `HR`, `VENDOR`, …).
2. Set backend env and redeploy the external system.
3. `GET {INVENTORY_API_URL}/catalog` with the key returns data.
4. Submit a request from the external system UI.
5. Request appears in RHET → **Stock Requests** as `PENDING`.
6. Approve in RHET → stock deducts; webhook updates the external system.

---

## 12. Do not

- Put the API key in frontend env (`VITE_*`, `NEXT_PUBLIC_*`).
- Approve or deduct stock only inside the external system — RHET is the stock authority.
- Hardcode one system name only — use a configurable system code / `externalReference` prefix.
- Assume env vars alone are enough — the external system must **call** RHET from code.

---

## 13. Prompt template (paste into another project)

Use this when asking Cursor (or another team) to wire a new external system:

```markdown
## Task: Connect this external system to RHET Inventory (generic integration)

### Context
RHET Inventory API:
`https://api-inventory.lca-app.com/api/v1/integrations`

Call RHET from the **backend only**. Each system uses its own API key from RHET → API Keys.

### Backend env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=<from RHET API Keys>
INVENTORY_WEBHOOK_URL=https://<this-system-api-domain>/api/webhooks/inventory

Support INVENTORY_API_KEY as alias for INVENTORY_INTEGRATION_KEY.

### Auth
X-Integration-Key: <INVENTORY_INTEGRATION_KEY>

### Endpoints
GET /catalog
GET /availability
POST /stock-requests
GET /stock-requests/:id

### Implement
1. inventoryClient service
2. On local request create → POST /stock-requests with externalReference = <SYSTEM_CODE>-<local-id>
3. Webhook POST /api/webhooks/inventory for fulfilled/rejected
4. Map UI labels (Men→Male, Top→Shirt, Extra Small→XS)
5. Update .env.example
6. Never expose the key to the frontend

### Accept
UI submit → RHET Stock Requests Pending → Approve → stock deducts → webhook updates this system
```
