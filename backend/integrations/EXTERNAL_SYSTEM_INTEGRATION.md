# External System ↔ RHET Inventory Integration Guide

Use this guide to connect **any** external system (PSMS/CMS, HR, vendor portal, another school app) to the **RHET Centralized Inventory Management System**.

**Paste into another project:** [EXTERNAL_SYSTEM_PASTE_PROMPT.md](./EXTERNAL_SYSTEM_PASTE_PROMPT.md)  
**PSMS example:** [PSMS_API_INTEGRATION.md](./PSMS_API_INTEGRATION.md)

---

## 1. Overview

```text
External UI (form)
  → External backend (your API)
      → RHET Inventory  POST /api/v1/integrations/stock-requests
          → RHET admin/user approves in Stock Requests
              → RHET warehouse stock decreases
              → RHET webhook POST → External backend
                  → External branch/local stock increases (your code)
```

| Layer | Who owns stock? |
|---|---|
| RHET Inventory | Central warehouse stock (source of truth) |
| External system | Branch / local stock (updated via webhook after approve) |

**Rules**

- Call RHET from the **external backend only** (never browser / `VITE_*` / `NEXT_PUBLIC_*`).
- No Firebase login for integration API.
- No SKU required for uniforms — match by category + gender + type + size.
- Each external system gets its **own API key** (RHET → **API Keys**).
- Setting env vars alone is **not enough** — your backend must **call** RHET in code.

---

## 2. Production URLs (LCA / Coolify)

| App | URL |
|---|---|
| RHET Inventory UI | `https://inventory.lca-app.com` |
| RHET Inventory API | `https://api-inventory.lca-app.com/api/v1/integrations` |
| Example external CMS API | `https://api-cms.lca-app.com` |

| Environment | `INVENTORY_API_URL` |
|---|---|
| Local | `http://localhost:3000/api/v1/integrations` |
| Production | `https://api-inventory.lca-app.com/api/v1/integrations` |

---

## 3. RHET Inventory setup (one-time per external system)

1. Sign in as **Admin** → `https://inventory.lca-app.com/admin/dashboard`
2. Open **Management → API Keys**
3. Click **Generate API key**
4. Enter system name (e.g. `PSMS`, `HR`, `VENDOR`) — becomes `systemCode`
5. Choose expiration: 7 days / 1 month / No expiration
6. Copy the modal immediately (shown once):
   - `INVENTORY_API_URL`
   - `INVENTORY_API_KEY`
   - Full `.env` block via **Copy .env configuration**

Every request from that system:

```http
X-Integration-Key: rhet_<system>_<secret>
```

or

```http
Authorization: Bearer rhet_<system>_<secret>
```

### Optional RHET backend fallback webhook

On RHET Inventory **backend** Coolify env (fallback if request has no `webhookUrl`):

```env
PSMS_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
```

Use a generic name per client in the future; today this env is the default webhook when `webhookUrl` is omitted on the request.

**Do not** put the external system's API key in RHET env — that key is for **incoming** calls **to** RHET and lives on the **external** backend only.

---

## 4. External system setup

### 4.1 Backend `.env` (required)

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_psms_paste-from-api-keys-modal
INVENTORY_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
```

| Variable | Required | Description |
|---|---|---|
| `INVENTORY_API_URL` | Yes | RHET integration base URL |
| `INVENTORY_INTEGRATION_KEY` | Yes | From RHET → API Keys (alias: `INVENTORY_API_KEY`) |
| `INVENTORY_WEBHOOK_URL` | Recommended | Your endpoint for approve/reject callbacks |

Redeploy external backend after changing env.

### 4.2 Backend code (required)

| # | Task |
|---|---|
| 1 | `inventoryClient` service — `getCatalog`, `submitStockRequests`, `getStockRequest` |
| 2 | On local request create → `POST /stock-requests` to RHET |
| 3 | `POST /api/webhooks/inventory` — handle fulfilled/rejected |
| 4 | On `stock_request.fulfilled` → increase **local/branch** stock |
| 5 | Map UI labels to RHET values **exactly** (see §6) |
| 6 | Never expose API key to frontend |

### 4.3 Recommended local DB columns

```sql
inventory_request_id UUID NULL,
external_reference VARCHAR(100) UNIQUE,
inventory_sync_status VARCHAR(20),   -- SYNCED | FAILED
inventory_sync_error VARCHAR(500)
```

Use `externalReference` = `<SYSTEM_CODE>-<local_id>` (e.g. `PSMS-19`).

---

## 5. API reference

Base: `{INVENTORY_API_URL}`  
Auth: `X-Integration-Key: <key>`

### GET `/catalog`

Load categories and items for dropdowns.

```bash
curl https://api-inventory.lca-app.com/api/v1/integrations/catalog \
  -H "X-Integration-Key: YOUR_KEY"
```

### GET `/availability`

```http
GET /availability?categoryName=School%20Uniform&gender=Male&type=Polo&size=S
```

### POST `/stock-requests`

```json
{
  "requestDate": "2026-07-17",
  "requestedBy": "Branch Admin Name",
  "reason": "Restock branch display",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "batchReference": "OPTIONAL-BATCH",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Polo",
      "size": "S",
      "quantity": 2,
      "externalReference": "PSMS-19"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `categoryName` | Must match RHET category exactly |
| `gender`, `type`, `size` | Required for uniform categories |
| `type` | Must match inventory item type **exactly** (`Polo` ≠ `Shirt`) |
| `size` | Use `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL` |
| `externalReference` | Unique per row: `<SYSTEM>-<localId>` |
| `webhookUrl` | Optional if RHET `PSMS_WEBHOOK_URL` fallback is set |
| `components` | **Learning Kit only** — array of concrete component choices (see below) |

#### Learning Kit requests

Kit BOM in RHET stores **categories only**. The external system must send the concrete item for every included category:

- Uniform → `gender` + `type` + `size`
- Non-uniform → `itemName` and/or `sku`

```json
{
  "categoryName": "Learning Kit",
  "itemName": "grade-1-learning-kit",
  "quantity": 2,
  "externalReference": "PSMS-KIT-1",
  "components": [
    { "categoryName": "LCA T-Shirt", "gender": "Unisex", "type": "Shirt", "size": "M", "quantity": 2 },
    { "categoryName": "School Uniform", "gender": "Male", "type": "Polo", "size": "S", "quantity": 2 },
    { "categoryName": "School Uniform", "gender": "Male", "type": "Short", "size": "S", "quantity": 2 },
    { "categoryName": "Backpack", "itemName": "school-backpack", "sku": "BAG-SCHOOL-BACKPACK", "quantity": 2 }
  ]
}
```

On approve, RHET deducts kit stock + each resolved component using the **requested quantities**.  
Shopee allocate moves **kit stock only** (component SKUs are not known until a stock request).

Response (201): array of created requests with `requestId`, `status: PENDING`.

### GET `/stock-requests/{requestId}`

Poll status by RHET UUID. Learning Kit responses include a `components` array.

---

## 6. Matching rules (critical)

Uniform categories (`School Uniform`, `PE Uniform`, …) match:

```text
categoryName + gender + type + size  →  variation "Male · Polo · S"
```

### UI → RHET mapping

| External UI | Send to RHET |
|---|---|
| Men / Male | `Male` |
| Women / Female | `Female` |
| Unisex | `Unisex` |
| Polo | **`Polo`** (not Shirt) |
| Shirt | `Shirt` |
| Top | Map to actual item: Polo → `Polo`, shirt → `Shirt` |
| Pants / Short / Full Set | `Pants` / `Short` / `Full Set` |
| Extra Small / Small / Medium / Large | `XS` / `S` / `M` / `L` |
| Extra Large / 2XL / 3XL | `XL` / `2XL` / `3XL` |

### Common mismatch (real example)

| Request sent | Inventory has | Result |
|---|---|---|
| `Male · Shirt · S` | `Male · Polo · S` (50 pcs) | **No match** |
| `Male · Polo · S` | `Male · Polo · S` | **Match** ✅ |

**Tip:** Call `GET /catalog` and use RHET `variation` values in your form or mapping layer.

Non-uniform categories: send `categoryName` + `itemName`.

---

## 7. Webhooks

RHET POSTs to `webhookUrl` on the request (or `PSMS_WEBHOOK_URL` fallback).

| Event | When |
|---|---|
| `stock_request.created` | Stored in RHET |
| `stock_request.fulfilled` | Approved; RHET stock deducted |
| `stock_request.rejected` | Rejected in RHET |

Example payload:

```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "PSMS-19",
  "sourceSystem": "PSMS",
  "status": "FULFILLED",
  "requestedBy": "Paul Camus",
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Polo",
  "size": "S",
  "quantity": 2,
  "matchedSku": "SCH-M-POLO-S",
  "processedBy": "Abby",
  "approvedBy": "Abby",
  "processedByName": "Abby",
  "processedByUserId": "e16bb708-1396-40aa-95e0-7235e20d7f60",
  "processedAt": "2026-07-17T08:00:00.000Z"
}
```

**`processedBy` / `approvedBy` / `processedByName`** are always the RHET admin **display name** (`users.full_name`, or email if name is empty). They are never a UUID. The user id is only in **`processedByUserId`**.

**External webhook handler must:**

1. Find local row by `externalReference` or `requestId`
2. Update local status → Approved/Fulfilled or Rejected
3. On **fulfilled** → **increase branch merchandise stock** (if that is your business rule)
4. Respond `200` quickly

RHET does **not** increase external stock — only your webhook code does.

---

## 8. RHET internal actions (Firebase auth)

These are for RHET UI users, not external systems:

| Action | Path |
|---|---|
| List requests | `GET /api/v1/stock-requests` |
| Approve | `POST /api/v1/stock-requests/:id/approve` |
| Reject | `POST /api/v1/stock-requests/:id/reject` |

Approve opens a **details modal** and blocks if out of stock or unmatched.

---

## 9. Example client (Node.js)

```javascript
const BASE_URL = process.env.INVENTORY_API_URL
const KEY = process.env.INVENTORY_INTEGRATION_KEY || process.env.INVENTORY_API_KEY

async function submitToInventory(form) {
  const res = await fetch(`${BASE_URL}/stock-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': KEY,
    },
    body: JSON.stringify({
      requestDate: form.requestDate,
      requestedBy: form.requestedBy,
      reason: form.reason,
      webhookUrl: process.env.INVENTORY_WEBHOOK_URL,
      items: form.items.map((row) => ({
        categoryName: row.categoryName,
        gender: row.gender,
        type: row.type,
        size: row.size,
        quantity: Number(row.quantity),
        externalReference: `${form.systemCode}-${row.localId}`,
      })),
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error?.message || 'Inventory request failed')
  return body.data
}
```

---

## 10. Test checklist

1. **Catalog** — `GET /catalog` returns JSON with your key
2. **Submit** — request appears in RHET → **Stock Requests** as `PENDING`
3. **Match** — details modal shows Matched SKU and current stock (not `—`)
4. **Approve** — RHET inventory quantity decreases
5. **Webhook** — external system status updates and branch stock increases
6. **Reject path** — webhook `stock_request.rejected` updates external status

### PowerShell test (submit)

```powershell
$headers = @{
  "X-Integration-Key" = "YOUR_KEY"
  "Content-Type" = "application/json"
}
$body = @{
  requestDate = "2026-07-17"
  requestedBy = "Test"
  reason = "Smoke test"
  webhookUrl = "https://api-cms.lca-app.com/api/webhooks/inventory"
  items = @(
    @{
      categoryName = "School Uniform"
      gender = "Male"
      type = "Polo"
      size = "S"
      quantity = 1
      externalReference = "TEST-001"
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method POST `
  -Uri "https://api-inventory.lca-app.com/api/v1/integrations/stock-requests" `
  -Headers $headers -Body $body
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| External Pending, RHET empty | Backend never calls RHET | Implement `POST /stock-requests` on submit |
| `No inventory item matched` | Wrong `type`/`size`/gender | Use catalog values; Polo ≠ Shirt |
| Approve blocked, 0 stock | RHET warehouse empty | Restock RHET inventory first |
| RHET deducts, CMS unchanged | No webhook handler | Implement `POST /api/webhooks/inventory` |
| 401 on catalog | Wrong/revoked key | Regenerate in API Keys, update external env |
| Webhook never fires | Missing `webhookUrl` and no RHET fallback | Set `INVENTORY_WEBHOOK_URL` + RHET `PSMS_WEBHOOK_URL` |

---

## 12. Do not

- Put integration key in frontend env
- Map all “Top” items to `Shirt` — use correct `Polo` / `Shirt`
- Approve stock in external system only — RHET must approve first
- Assume env vars replace code changes
