# RHET Inventory — External Stock Request Integration Guide

**Audience:** Engineering teams integrating any external system (branch CMS, campus ops, HR shop, vendor portal, etc.) with RHET Inventory.

**Purpose:** Explain exactly what you must implement so stock requests flow smoothly — including **Learning Kits**, which require extra request-time detail.

This guide is **system-agnostic**. Replace placeholders such as `YOUR_SYSTEM` with your own system code (e.g. `PSMS`, `CMS`, `HR`).

---

## 1. Mental model

```text
Your UI (branch form)
  → Your backend
      → RHET  POST /api/v1/integrations/stock-requests
          → RHET Stock Requests (PENDING)
              → RHET user Approves
                  → RHET warehouse stock decreases
                  → RHET webhook → Your backend
                      → You increase local/branch stock (your rules)
```

| Rule | Detail |
|---|---|
| Call RHET from your **backend only** | Never put the integration key in a browser / mobile client env |
| RHET is the warehouse source of truth | Approving in your app alone does **not** deduct RHET stock |
| Matching is attribute-based | Uniforms: category + gender + type + size. Non-uniform: category + item name and/or SKU |
| Learning Kits are special | Kit BOM = **categories only**. Your request must name the **concrete** items for every included category |

---

## 2. Environments & base URL

| Environment | Integration base URL |
|---|---|
| Local RHET API | `http://localhost:3000/api/v1/integrations` |
| Production (LCA) | `https://api-inventory.lca-app.com/api/v1/integrations` |

UI (for humans / RHET admins): `https://inventory.lca-app.com`

All paths below are relative to the integration base URL.

---

## 3. One-time setup

### 3.1 On RHET (admin)

1. Sign in as Admin → **Management → API Keys**
2. **Generate API key**
3. Enter a system name (becomes `systemCode`, e.g. `PSMS`, `BRANCH_OPS`)
4. Choose expiration
5. Copy immediately (shown once):
   - Integration base URL
   - API key (`rhet_<system>_<secret>`)

Each partner system gets its **own** key. Do not share keys across products.

### 3.2 On your backend

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_your_system_paste-from-rhet-modal
INVENTORY_WEBHOOK_URL=https://your-api.example.com/api/webhooks/inventory
```

| Variable | Required | Purpose |
|---|---|---|
| `INVENTORY_API_URL` | Yes | RHET integration base |
| `INVENTORY_INTEGRATION_KEY` | Yes | From RHET API Keys (alias: `INVENTORY_API_KEY`) |
| `INVENTORY_WEBHOOK_URL` | Strongly recommended | Your callback URL for created / fulfilled / rejected |

### 3.3 Auth header (every call)

```http
X-Integration-Key: rhet_<system>_<secret>
```

Also accepted:

```http
Authorization: Bearer rhet_<system>_<secret>
```

### 3.4 What you must implement

| # | Capability | Notes |
|---|---|---|
| 1 | HTTP client to RHET | Server-side only |
| 2 | `GET /catalog` | Drive dropdowns from RHET values |
| 3 | `GET /availability` (optional) | Pre-check stock before submit |
| 4 | `POST /stock-requests` | Create request(s) when your user submits |
| 5 | `GET /stock-requests/:id` (optional) | Poll if webhooks are delayed |
| 6 | Webhook endpoint | Handle `created` / `fulfilled` / `rejected` |
| 7 | On `fulfilled` | Apply your local stock / status rules |
| 8 | Value mapping | Map UI labels → exact RHET gender / type / size / item names |
| 9 | Learning Kit UI | Collect component specs for every BOM category (see §7) |

Optional RHET-side fallback webhook (if a request omits `webhookUrl`): RHET backend env `PSMS_WEBHOOK_URL`. Prefer sending `webhookUrl` on each request so multi-partner setups stay correct.

---

## 4. API overview

Envelope:

```json
{ "success": true, "data": { }, "meta": { } }
```

Errors:

```json
{ "success": false, "error": { "code": "…", "message": "…", "details": null } }
```

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/catalog` | Active categories + inventory items |
| `GET` | `/availability` | Check one SKU by attributes |
| `POST` | `/stock-requests` | Submit one or many line items |
| `GET` | `/stock-requests/:requestId` | Read status by RHET UUID |

---

## 5. Catalog — build your forms from RHET

```http
GET /catalog
X-Integration-Key: YOUR_KEY
```

Typical `data` shape:

```json
{
  "categories": [
    { "categoryId": "uuid", "categoryName": "School Uniform" },
    { "categoryId": "uuid", "categoryName": "Learning Kit" }
  ],
  "items": [
    {
      "inventoryId": "uuid",
      "sku": "SCH-M-POLO-S",
      "itemName": "classic-white-polo",
      "stocks": 40,
      "status": "ACTIVE",
      "variation": "Male · Polo · S",
      "categoryName": "School Uniform"
    }
  ]
}
```

**How to use it**

- Uniform dropdowns: filter items by `categoryName`, then expose unique `gender` / `type` / `size` from catalog (or parse `variation` as `Gender · Type · Size`).
- Non-uniform: pick `itemName` / `sku` from items in that category.
- Learning Kit **parent** lines: pick kit by `categoryName = "Learning Kit"` + `itemName` (and optionally confirm `sku`).

**Important limitation today:** `/catalog` lists Learning Kit **items**, but does **not** yet return each kit’s bill of materials (which categories the kit includes).  
Until that is exposed, coordinate with RHET admins on each kit’s included categories, and keep that recipe in your config or UI. If you omit a required category in `components`, RHET stores a `failureReason` and approve will fail.

---

## 6. Availability (optional pre-check)

```http
GET /availability?categoryName=School%20Uniform&gender=Male&type=Polo&size=S
```

Non-uniform:

```http
GET /availability?categoryName=Backpack&itemName=school-backpack
```

Response sketch:

```json
{
  "available": true,
  "stocks": 12,
  "status": "ACTIVE",
  "sku": "SCH-M-POLO-S",
  "itemName": "…",
  "variation": "Male · Polo · S",
  "inventoryId": "uuid"
}
```

For Learning Kits you should also pre-check **each component** you will send, not only the kit row.

---

## 7. Submitting stock requests

```http
POST /stock-requests
Content-Type: application/json
X-Integration-Key: YOUR_KEY
```

### 7.1 Top-level body

| Field | Required | Notes |
|---|---|---|
| `requestedBy` | Yes | 2–150 chars |
| `reason` | Yes | 5–500 chars |
| `items` | Yes | 1–50 line items |
| `requestDate` | No | Defaults to today |
| `batchReference` | No | Optional batch id |
| `webhookUrl` | Recommended | Your callback URL |

### 7.2 Each `items[]` row

| Field | When required | Notes |
|---|---|---|
| `categoryName` | Always | Exact RHET category name |
| `quantity` | Always | Positive integer |
| `externalReference` | Strongly recommended | Unique per `(sourceSystem, externalReference)`. Pattern: `YOUR_SYSTEM-<localId>` |
| `gender`, `type`, `size` | Uniform categories | Exact RHET values |
| `itemName` | Non-uniform **and Learning Kit** | Exact item name (normalized lowercase/hyphen style as stored in RHET) |
| `components` | **Learning Kit only** | Concrete choices for every included category (see §8) |

Response `201`: array of created requests (`requestId`, `status: PENDING`, `matchedSku` if matched, `failureReason` if not).

Store `requestId` + `externalReference` on your local request row.

---

## 8. Learning Kits (read carefully)

> **RHET model (2026-07):** Learning Kit stock is **virtual**. The kit BOM lists **categories only**. The requesting system fills concrete items via `components[]` (uniform: gender/type/size; non-uniform: itemName/sku). Displayed available kits ≈ `min(category stock totals)`. Approve deducts the resolved component SKUs. CMS Learning Kit UI may still be out of scope; API `components[]` is required for kit requests.

### 8.1 What a Learning Kit is in RHET

A Learning Kit is a catalog row (price / SKU / name) plus a **bill of materials (BOM)** of **categories**.

| Concept | Meaning |
|---|---|
| Kit stock (displayed) | **Computed** from included category stock totals |
| BOM | Categories the kit includes (e.g. School Uniform, Backpack, ID Lace) |
| Recipe qty | Always **1** per category slot |
| Concrete SKUs | Chosen by **your stock request** `components[]` |

RHET admin UI for kits: category-only rows. No gender/type/size and no pinned backpack SKU on the kit itself.

### 8.2 What your system must send

When requesting a Learning Kit:

1. Identify the kit: `categoryName: "Learning Kit"` + `itemName` (exact).
2. Send `quantity` = how many kits.
3. Send `components[]` covering **every category** in that kit’s BOM.
4. For each component line, be specific:
   - **Uniform category** → `gender` + `type` + `size` + `quantity`
   - **Non-uniform category** → `itemName` and/or `sku` + `quantity`
5. Component `quantity` should normally match kit quantity (or your agreed business rule). RHET deducts using the **component quantities you send**.

### 8.3 Example — full kit request

Assume RHET kit `grade-1-learning-kit` includes categories: **LCA T-Shirt**, **School Uniform**, **Backpack**.

```json
{
  "requestDate": "2026-07-23",
  "requestedBy": "Branch Admin",
  "reason": "Restock Grade 1 learning kits for campus display",
  "webhookUrl": "https://your-api.example.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "Learning Kit",
      "itemName": "grade-1-learning-kit",
      "quantity": 2,
      "externalReference": "YOUR_SYSTEM-KIT-1001",
      "components": [
        {
          "categoryName": "LCA T-Shirt",
          "gender": "Unisex",
          "type": "Shirt",
          "size": "M",
          "quantity": 2
        },
        {
          "categoryName": "School Uniform",
          "gender": "Male",
          "type": "Polo",
          "size": "S",
          "quantity": 2
        },
        {
          "categoryName": "School Uniform",
          "gender": "Male",
          "type": "Short",
          "size": "S",
          "quantity": 2
        },
        {
          "categoryName": "Backpack",
          "itemName": "school-backpack",
          "sku": "BAG-SCHOOL-BACKPACK",
          "quantity": 2
        }
      ]
    }
  ]
}
```

### 8.4 School Uniform inside a kit

BOM has **one** slot: category `School Uniform`.

Your request may send **one or more** component lines for that category:

| Branch wants | What to send |
|---|---|
| Polo only | One `School Uniform` line with `type: "Polo"` |
| Polo + Short | Two `School Uniform` lines (Polo and Short) |
| Quantity | Per line, as requested |

RHET requires **at least one** component line for each BOM category. Extra lines for the same category (e.g. Polo + Short) are allowed and each is deducted separately.

### 8.5 What happens on RHET approve

In one transaction RHET:

1. Deducts **kit** stock by the kit `quantity`
2. Resolves each `components[]` line to a real inventory row
3. Deducts each component by **that line’s** `quantity`
4. Writes stock movements for kit + components
5. Sends webhook `stock_request.fulfilled`

If any kit or component is short → approve fails (`INSUFFICIENT_STOCK` / match errors). Fix stock or specs and retry.

### 8.6 Learning Kit checklist for your UI

- [ ] User selects which Learning Kit (`itemName`)
- [ ] UI knows (from config / RHET admin) which categories that kit includes
- [ ] For each included category, UI collects:
  - Uniform → gender, type, size
  - Non-uniform → item name and/or SKU (from catalog)
- [ ] For School Uniform, allow one or more type lines as needed
- [ ] Component quantities follow your business rule (usually = kit qty)
- [ ] You persist the component choices locally (webhook may not echo full BOM)

### 8.7 Common Learning Kit failures

| Symptom | Cause | Fix |
|---|---|---|
| `failureReason`: must include component specs | Missing `components` | Always send `components` for kits |
| `requires component specs for category "…"` | BOM category omitted | Add that category to `components` |
| `not part of this Learning Kit` | Extra / wrong category name | Only send categories on the kit BOM |
| `No inventory item matched` | Wrong gender/type/size/itemName | Use `/catalog` values exactly |
| Approve blocked: component short stock | Warehouse empty for that SKU | Restock RHET or change size/item |
| Kit matched but components empty | Submitted without `components` | Rebuild submit payload |

---

## 9. Matching rules (all categories)

### 9.1 Uniform-like categories

Examples: `School Uniform`, `PE Uniform`, `LCA T-Shirt` (and names ending with ` uniform`).

```text
categoryName + gender + type + size  →  one inventory row
```

| Field | Allowed examples |
|---|---|
| Gender | `Male`, `Female`, `Unisex` (School Uniform has no Unisex in RHET UI) |
| Type | `Polo`, `Short`, `Blouse`, `Skirt`, `Shirt`, `Pants` — **exact** |
| Size | `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `4XL`, `5XL` |

Map UI labels carefully (`Men` → `Male`, `Extra Large` → `XL`).  
`Shirt` ≠ `Polo`. Wrong type = no match even if stock exists.

### 9.2 Non-uniform categories

Examples: `Backpack`, `Book`, `Accessory`, …

```text
categoryName + itemName  and/or  sku  →  one inventory row
```

Prefer values from `/catalog`. Item names in RHET are typically lowercase with hyphens.

### 9.3 Learning Kit parent row

Treated like non-uniform for matching the kit itself:

```text
categoryName = "Learning Kit" + itemName  →  kit inventory row
```

Then `components[]` resolve as above.

### 9.4 Plain (non-kit) examples

**Uniform**

```json
{
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Polo",
  "size": "S",
  "quantity": 2,
  "externalReference": "YOUR_SYSTEM-19"
}
```

**Non-uniform**

```json
{
  "categoryName": "Backpack",
  "itemName": "school-backpack",
  "quantity": 1,
  "externalReference": "YOUR_SYSTEM-20"
}
```

---

## 10. Webhooks (your backend)

RHET POSTs JSON to `webhookUrl` (or RHET fallback env if omitted).

| Event | When | Your typical action |
|---|---|---|
| `stock_request.created` | Stored in RHET | Mark local row as synced / pending RHET |
| `stock_request.fulfilled` | Approved; RHET stock deducted | Mark approved; **increase local/branch stock** if that is your rule |
| `stock_request.rejected` | Rejected in RHET | Mark rejected; show `rejectionReason` |

Example fulfilled payload (kit or normal item — kit-level fields):

```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "YOUR_SYSTEM-19",
  "sourceSystem": "YOUR_SYSTEM",
  "status": "FULFILLED",
  "requestedBy": "Branch Admin",
  "reason": "Restock",
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Polo",
  "size": "S",
  "quantity": 2,
  "matchedSku": "SCH-M-POLO-S",
  "inventoryId": "uuid",
  "processedBy": "Abby",
  "approvedBy": "Abby",
  "processedByName": "Abby",
  "processedByUserId": "e16bb708-1396-40aa-95e0-7235e20d7f60",
  "processedAt": "2026-07-23T08:00:00.000Z",
  "timestamp": "2026-07-23T08:00:00.000Z"
}
```

Notes:

- `processedBy` / `approvedBy` / `processedByName` are **display names**, never UUIDs.
- Use `processedByUserId` if you need the RHET user id.
- Current webhook payload is **request-level**. For Learning Kits, component lines are **not** guaranteed in the webhook — keep the component choices you submitted in your own DB.
- Respond **HTTP 200** quickly. RHET records delivery status.

RHET does **not** update your local stock. Only your webhook (or polling) code does.

---

## 11. Polling (optional)

```http
GET /stock-requests/{requestId}
X-Integration-Key: YOUR_KEY
```

Useful if webhooks fail. Learning Kit responses include a `components` array with stored specs and match results.

Statuses you may see: `PENDING`, `APPROVED`, `FULFILLED`, `REJECTED`, `FAILED`.

Operational happy path after approve: `FULFILLED`.

---

## 12. Recommended local data

Store at least:

```text
local_request_id
external_reference          UNIQUE  (YOUR_SYSTEM-<id>)
rhet_request_id             UUID from RHET
rhet_sync_status            SYNCED | FAILED | …
rhet_failure_reason
rhet_status                 PENDING | FULFILLED | …
component_snapshot_json     Learning Kit component choices you sent
```

---

## 13. Example Node.js client (stock request)

```javascript
const BASE_URL = process.env.INVENTORY_API_URL
const KEY = process.env.INVENTORY_INTEGRATION_KEY || process.env.INVENTORY_API_KEY

async function submitStockRequests(payload) {
  const res = await fetch(`${BASE_URL}/stock-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': KEY,
    },
    body: JSON.stringify({
      requestDate: payload.requestDate,
      requestedBy: payload.requestedBy,
      reason: payload.reason,
      webhookUrl: process.env.INVENTORY_WEBHOOK_URL,
      batchReference: payload.batchReference,
      items: payload.items,
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error?.message || `Inventory request failed (${res.status})`)
  }
  return body.data
}

// Learning Kit example item
const learningKitItem = {
  categoryName: 'Learning Kit',
  itemName: 'grade-1-learning-kit',
  quantity: 2,
  externalReference: 'YOUR_SYSTEM-KIT-1001',
  components: [
    { categoryName: 'LCA T-Shirt', gender: 'Unisex', type: 'Shirt', size: 'M', quantity: 2 },
    { categoryName: 'Backpack', itemName: 'school-backpack', quantity: 2 },
  ],
}
```

---

## 14. End-to-end test plan

1. **Auth** — `GET /catalog` returns 200 with your key.
2. **Uniform request** — submit Polo/S; appears in RHET → Stock Requests as `PENDING` with matched SKU.
3. **Approve** — RHET stocks decrease; webhook `fulfilled` received; your local stock updates.
4. **Reject** — webhook `rejected`; local status updated; RHET stock unchanged.
5. **Non-uniform** — submit backpack by `itemName`; match + approve works.
6. **Learning Kit** — submit kit with full `components`; create has no `failureReason`; approve deducts kit **and** each component; webhook received.
7. **Learning Kit negative** — omit a BOM category → `failureReason` set; fix and resubmit.
8. **Idempotency** — reuse same `externalReference` → unique constraint / error (do not double-create).

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Local Pending, nothing in RHET | Backend never called RHET | Call `POST /stock-requests` on submit |
| 401 | Bad / expired / revoked key | Regenerate in RHET API Keys |
| No match / `failureReason` | Wrong attributes or item name | Align with `/catalog` |
| Approve blocked | Insufficient kit or component stock | Restock RHET or change specs |
| RHET deducted, local unchanged | Webhook missing or handler incomplete | Implement webhook; verify `webhookUrl` |
| Kit approve fails on component | Missing or wrong `components` | See §8 |
| Webhook never arrives | No `webhookUrl` and no RHET fallback | Set URL on request and/or RHET env |

---

## 16. Do not

- Expose the integration key to browsers or mobile apps
- Approve stock only in your system and assume RHET changed
- Guess uniform `type` values (`Shirt` vs `Polo`)
- Submit a Learning Kit without `components` for every BOM category
- Assume Shopee channel allocation will pick uniform sizes for a kit — allocate moves **kit stock only**; component deduction for kits is via **stock-request approve**

---

## 17. Partner onboarding checklist (operations)

**RHET team**

- [ ] Create API key for the partner system
- [ ] Confirm categories and Learning Kit BOM recipes with the partner
- [ ] Confirm webhook URL reachability from RHET
- [ ] Smoke-test one uniform + one Learning Kit request in staging/production

**Partner team**

- [ ] Backend env configured
- [ ] Catalog-driven forms
- [ ] Stock request submit + unique `externalReference`
- [ ] Learning Kit component collector
- [ ] Webhook handler + local stock rules
- [ ] Monitoring for `failureReason` and failed webhooks

When both checklists are green, day-to-day operations stay clear: partners request with exact attributes; RHET approves; warehouse and branch stock stay in sync.
