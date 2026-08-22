# RHET Inventory — New Partner System Onboarding

**Audience:** Engineering + ops teams connecting a **new** external system (not CMS/PSMS) to RHET Inventory.

**CMS / PSMS:** Already integrated. Use the CMS_* docs in this folder — do not create a second key for CMS unless rotating.

**Start here if you are a brand-new partner.** Deep field/API detail: [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md).  
**RHET admins generating keys:** [API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md).  
**Paste into your Cursor / repo:** [NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md).

---

## 1. What you are integrating

RHET Inventory is the **central warehouse**. Your system owns **branch / campus / local** stock.

```text
Your UI (request form)
  → Your backend only
      → RHET  POST /api/v1/integrations/stock-requests
          → RHET Stock Requests = PENDING
              → RHET user Approves / Rejects
                  → Approve: warehouse stock decreases
                  → RHET webhook → Your backend
                      → You update local status + local stock (your rules)
```

| Rule | Why |
|---|---|
| Call RHET from your **backend only** | Integration keys must never ship to browsers |
| Approving only in your app does nothing to RHET | Warehouse truth lives in RHET |
| Match by catalog attributes | Uniforms: category + gender + type + size. Other items: category + itemName/sku |
| Learning Kits need `components[]` | Kit BOM is category slots; you choose concrete SKUs on request |
| Unique `externalReference` | Prevents duplicate lines: `{SYSTEM_CODE}-{localId}` |

---

## 2. End-to-end checklist

### A. RHET admin (your contact at RHET)

1. Follow [API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md) — **Generate API key** for your system name.
2. Securely share: Integration API URL + API key + your agreed `systemCode`.
3. Confirm catalog categories / Learning Kit recipes you will use.
4. Confirm your webhook URL is reachable from RHET (HTTPS).

### B. Your backend

1. Add env vars (see §3).
2. Implement HTTP client + catalog-driven forms (§4–5).
3. On submit → `POST /stock-requests` (§6).
4. Implement webhook receiver (§7).
5. Run the test plan (§9).

### C. Go-live

- [ ] Staging key works (`GET /catalog` = 200)
- [ ] Uniform + non-uniform + (optional) Learning Kit paths verified
- [ ] Approve → webhook → local stock updated
- [ ] Reject → local status updated; RHET stock unchanged
- [ ] Monitoring for 401 / `failureReason` / failed webhooks

---

## 3. Environments & configuration

| Environment | Integration base URL |
|---|---|
| Local RHET | `http://localhost:3000/api/v1/integrations` |
| Production (LCA) | `https://api-inventory.lca-app.com/api/v1/integrations` |

Human UI: `https://inventory.lca-app.com`

### Your backend `.env`

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_your_system_paste-from-rhet
INVENTORY_WEBHOOK_URL=https://your-api.example.com/api/webhooks/inventory
# Optional alias also supported by many samples:
# INVENTORY_API_KEY=<same as INVENTORY_INTEGRATION_KEY>
```

| Variable | Required | Notes |
|---|---|---|
| `INVENTORY_API_URL` | Yes | Must end at `/integrations` (no trailing slash required) |
| `INVENTORY_INTEGRATION_KEY` | Yes | From RHET → API Keys (shown once) |
| `INVENTORY_WEBHOOK_URL` | Strongly recommended | Sent as `webhookUrl` on each stock request |

**Auth on every call**

```http
X-Integration-Key: rhet_<system>_<secret>
```

Also accepted: `Authorization: Bearer rhet_<system>_<secret>`.

---

## 4. Capabilities you must build

| # | Capability | Endpoint / action |
|---|---|---|
| 1 | Server-side HTTP client | Never from frontend |
| 2 | Load catalog for dropdowns | `GET /catalog` |
| 3 | Optional stock pre-check | `GET /availability` |
| 4 | Submit requests | `POST /stock-requests` |
| 5 | Optional poll | `GET /stock-requests/:id` |
| 6 | Webhook HTTP endpoint | `created` / `fulfilled` / `rejected` |
| 7 | On `fulfilled` | Apply **your** local stock / status rules |
| 8 | Exact value mapping | UI labels → RHET catalog values |
| 9 | Learning Kit UI (if used) | Collect `components[]` for every BOM category |

Optional RHET fallback webhook env (`PSMS_WEBHOOK_URL`) exists for legacy CMS. **New partners should always send `webhookUrl` on the request** so callbacks go to the correct system.

---

## 5. Catalog-driven UI (required pattern)

```http
GET /catalog
X-Integration-Key: YOUR_KEY
```

Typical shape:

```json
{
  "categories": [
    {
      "categoryId": "uuid",
      "categoryName": "School Uniform",
      "categoryKind": "SCHOOL_UNIFORM"
    }
  ],
  "items": [
    {
      "inventoryId": "uuid",
      "sku": "SCH-M-POLO-S",
      "itemName": "classic-white-polo",
      "stocks": 40,
      "status": "ACTIVE",
      "variation": "Male · Polo · S",
      "categoryName": "School Uniform",
      "categoryKind": "SCHOOL_UNIFORM"
    }
  ]
}
```

| `categoryKind` | How matching works |
|---|---|
| `SCHOOL_UNIFORM` / `PE_UNIFORM` / `LCA_SHIRT` | Require `gender` + `type` + `size` |
| `LEARNING_KIT` | UI: **Bundle**. Match kit by exact `categoryName` + `itemName`; send `components[]`. Not only the category named Learning Kit (e.g. Moving Up Kit). |
| `OTHER` | Match by `itemName` and/or `sku` |

**Do not hard-code** category lists or size charts in your UI if RHET can change catalog. Prefer live `/catalog`.

Category **names** are unique; the same **kind** may appear under different names (e.g. two school-uniform-style categories). Always send the exact `categoryName` from catalog.

---

## 6. Submit stock requests

```http
POST /stock-requests
Content-Type: application/json
X-Integration-Key: YOUR_KEY
```

### Top-level

| Field | Required | Notes |
|---|---|---|
| `requestedBy` | Yes | 2–150 chars |
| `branchName` | Yes | Branch / campus display name (2–150 chars) |
| `reason` | Yes | 5–500 chars |
| `items` | Yes | 1–50 lines |
| `requestDate` | No | Defaults to today |
| `batchReference` | Strongly recommended | Shared cart id so RHET groups multi-item submits for Manage / invoicing |
| `webhookUrl` | Recommended | Your callback |

### Each `items[]` row

| Field | When | Notes |
|---|---|---|
| `categoryName` | Always | Exact RHET name |
| `quantity` | Always | Positive integer |
| `externalReference` | Strongly recommended | `{SYSTEM_CODE}-{localId}` unique per system |
| `gender`, `type`, `size` | Uniform kinds | Exact catalog values |
| `itemName` / `sku` | Non-uniform + Learning Kit parent | Exact names |
| `components` | Learning Kit | Concrete specs per BOM category |

**Uniform example**

```json
{
  "requestedBy": "Campus Admin",
  "branchName": "LCA Makati",
  "reason": "Restock Male Polo size S",
  "webhookUrl": "https://your-api.example.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Polo",
      "size": "S",
      "quantity": 2,
      "externalReference": "HR-1001"
    }
  ]
}
```

**Non-uniform example**

```json
{
  "requestedBy": "Campus Admin",
  "branchName": "LCA Makati",
  "reason": "Restock backpacks",
  "webhookUrl": "https://your-api.example.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "Backpack",
      "itemName": "school-backpack",
      "quantity": 1,
      "externalReference": "HR-1002"
    }
  ]
}
```

**Learning Kit** — see §8 in [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md). Summary: parent row = Learning Kit + `itemName`; `components[]` must cover every category on the kit BOM.

Response `201`: array of created requests (`requestId`, `status: PENDING`, `matchedSku` / `failureReason`). Store `requestId` + `externalReference` locally.

---

## 7. Webhooks (your backend)

RHET POSTs JSON to `webhookUrl`.

| Event | When | Your action |
|---|---|---|
| `stock_request.created` | Saved in RHET | Mark synced / pending RHET |
| `stock_request.fulfilled` | Approved; warehouse deducted | Mark approved; **increase local stock** if that is your rule |
| `stock_request.rejected` | Rejected | Mark rejected; show reason |

Match local rows by `externalReference` or `requestId`.

Important fields:

- `processedBy` / `approvedBy` / `processedByName` → **display names** (never UUID)
- `processedByUserId` → UUID if you need it
- Respond **HTTP 200** quickly

RHET does **not** update your database. Only your webhook (or polling) does.

---

## 8. Recommended local columns

```text
local_request_id
external_reference          UNIQUE  ({SYSTEM_CODE}-…)
rhet_request_id             UUID
rhet_sync_status            SYNCED | FAILED | …
rhet_failure_reason
rhet_status                 PENDING | FULFILLED | REJECTED | …
component_snapshot_json     Learning Kit choices you sent
```

---

## 9. Test plan

1. **Auth** — `GET /catalog` with your key → 200.
2. **Uniform** — submit → appears in RHET Stock Requests `PENDING` with matched SKU.
3. **Approve** — RHET stocks down; webhook `fulfilled`; local stock up.
4. **Reject** — webhook `rejected`; RHET stock unchanged.
5. **Non-uniform** — itemName match + approve.
6. **Learning Kit** (if in scope) — full `components[]`; approve deducts components; webhook received.
7. **Idempotency** — reuse `externalReference` → error / no double create.
8. **401** — wrong key → regenerate via RHET admin.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing in RHET | Your backend never called `POST /stock-requests` |
| 401 | Bad / expired / revoked key — regenerate in RHET API Keys |
| `failureReason` / no match | Align gender/type/size/itemName with `/catalog` |
| Approve blocked | Insufficient warehouse (or kit component) stock |
| RHET deducted, local unchanged | Webhook missing or handler incomplete |
| Wrong system got webhook | Always send your own `webhookUrl` |

---

## 11. Do not

- Put the integration key in frontend env
- Share the CMS/`PSMS` key with a different product
- Approve only locally and assume RHET changed
- Guess `Polo` vs `Shirt`
- Submit Learning Kits without `components` for every BOM category
- Hard-code category dropdowns if catalog can change

---

## 12. Document pack for your team

| Document | Use |
|---|---|
| **This file** | Onboarding narrative + checklist |
| [API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md) | How RHET creates / rotates keys |
| [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) | Full API, Learning Kits, examples |
| [NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md) | Paste into Cursor to implement |
| CMS_* docs | **CMS only** — ignore unless you are PSMS/CMS |

When both sides finish the checklists, day-to-day ops stay simple: you request with exact catalog values; RHET approves; warehouse and local stock stay in sync.
