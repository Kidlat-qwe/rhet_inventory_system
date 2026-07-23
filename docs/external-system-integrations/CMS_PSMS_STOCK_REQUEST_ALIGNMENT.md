# CMS / PSMS ↔ RHET Inventory — Stock Request Alignment Guide

**Audience:** PSMS / CMS engineering team (PSMS and CMS are the same product).  
**Goal:** Keep Branch Admin “Request Stock” working after RHET Inventory page / matching / Learning Kit changes.  
**Canonical API contract:** [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)  
**Paste into CMS Cursor:** [CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md) (self-contained)

### Scope for this alignment pass (locked)

| Decision | Choice |
|---|---|
| Learning Kits in CMS Request Stock | **Blocked / hidden** — uniform + non-kit alignment only |
| Kit fulfill → `merchandisestbl` | **N/A** until kits are enabled later |
| Full kit `components[]` support | Deferred; see [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) §8 for a future pass |

Use this document to **update the existing CMS integration**. Do not rebuild from scratch unless the current client cannot send the fields below.

---

## 1. What still works (do not break)

The end-to-end model is unchanged:

```text
Branch Admin → CMS Merchandise “Request Stock”
  → CMS backend saves merchandiserequestlogtbl (Pending)
  → CMS POST RHET /stock-requests (X-Integration-Key)
  → RHET Stock Requests (PENDING)
  → RHET user Approves / Rejects
  → RHET webhook → CMS /api/webhooks/inventory
  → FULFILLED: add branch merchandisestbl stock (idempotent)
  → REJECTED: mark Rejected, no stock add
```

| Rule | Status |
|---|---|
| Frontend never calls RHET | Unchanged |
| Auth: `X-Integration-Key` | Unchanged |
| `externalReference = PSMS-<local_id>` | Unchanged |
| Superadmin does not approve integrated requests | Unchanged |
| Approved By = RHET display name from webhook | Unchanged |
| Legacy CMS-only flow if env missing | Unchanged |

### Production env (CMS backend only)

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=<key from RHET → API Keys>
INVENTORY_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
INVENTORY_SYSTEM_CODE=PSMS
```

Never put the key in `VITE_*` / frontend env.

---

## 2. What changed on RHET (why CMS must update)

RHET Inventory merchandise model was upgraded. Matching and Learning Kits are the breaking areas for CMS.

| Change | Effect on CMS |
|---|---|
| Uniforms use structured columns `uniform_gender`, `uniform_type`, `uniform_size` | Matching is still `categoryName + gender + type + size`, but values must be **exact** RHET labels. Wrong `type` (e.g. Polo sent as Shirt) → `failureReason` / no match. |
| Inventory page groups by category; items are per variant SKU | CMS forms should prefer **`GET /catalog`** over hard-coded local merchandise names where possible. |
| Learning Kit BOM = **category slots only** (no pinned component SKUs on the kit) | **This pass:** block Learning Kit in CMS Request Stock. Future: every kit line needs `components[]`. |
| Webhook `processedBy` / `approvedBy` / `processedByName` are display names only | Keep existing Approved By mapping; never store UUID as Approved By. |
| Channel allocation / Shopee is separate from stock requests | Ignore for merchandise stock requests. Does not replace this flow. |

Full field rules, Learning Kit examples, and webhooks: [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) §§5–10.

---

## 3. Current CMS touchpoints (reference)

Keep these modules; update mapping and payload builders inside them.

| Layer | Path / responsibility |
|---|---|
| Admin UI | `frontend/src/pages/admin/adminMerchandise.jsx` — Request Stock |
| Superadmin UI | `frontend/src/pages/superadmin/Merchandise.jsx` — Stock Requests; “Awaiting RHET Inventory” |
| Approved By helper | `frontend/src/utils/merchandiseRequests/approvedBy.js` |
| Create + proxy | `backend/routes/merchandiserequests.js` |
| Webhook | `backend/routes/inventoryWebhooks.js` |
| RHET HTTP client | `backend/services/inventory/inventoryClient.js` |
| Field map | `backend/services/inventory/inventoryFieldMapping.js` |
| Branch stock apply | `backend/services/inventory/applyMerchandiseRequestStock.js` |
| Repair | `POST /api/sms/merchandise-requests/:id/sync-inventory`, `repairInventoryFulfillment.js` |

### Local DB columns (`merchandiserequestlogtbl`) — keep

| Column | Purpose |
|---|---|
| `inventory_request_id` | RHET UUID |
| `inventory_status` | `PENDING` / `FULFILLED` / `REJECTED` / `FAILED` |
| `inventory_external_reference` | `PSMS-<id>` |
| `inventory_matched_sku` | Matched RHET SKU (reference) |
| `inventory_rejection_reason` | Reject / fail reason |
| `inventory_synced_at` | Last sync |
| `inventory_processed_by` | RHET admin display name (Approved By) |

**Deferred:** `inventory_components_json` only when Learning Kits are enabled later.

---

## 4. Required CMS updates (checklist)

### 4.1 Field mapping (highest priority)

Update `inventoryFieldMapping.js` so CMS → RHET values match RHET catalogs exactly.

| CMS UI concept | RHET `categoryName` | RHET `gender` | RHET `type` | RHET `size` |
|---|---|---|---|---|
| School / LCA Uniform · Polo | `School Uniform` | `Male` / `Female` | `Polo` | `XS`…`5XL` |
| School Uniform · Short | `School Uniform` | `Male` | `Short` | … |
| School Uniform · Blouse / Skirt | `School Uniform` | `Female` | `Blouse` / `Skirt` | … |
| PE Uniform · Shirt / Pants | `PE Uniform` | `Male` / `Female` / `Unisex` | `Shirt` / `Pants` | … |
| LCA T-Shirt | `LCA T-Shirt` | usually `Unisex` | `Shirt` | … |
| Backpack / Book / etc. | Exact category name | — | — | use `itemName` and/or `sku` |
| Learning Kit | `Learning Kit` | — | — | **Blocked this pass** — do not send |

**Gender map**

| CMS label | RHET |
|---|---|
| Men / Male | `Male` |
| Women / Female | `Female` |
| Unisex | `Unisex` |

**Type map (do not collapse Polo → Shirt)**

| CMS label | RHET |
|---|---|
| Polo | `Polo` |
| Short | `Short` |
| Blouse | `Blouse` |
| Skirt | `Skirt` |
| Shirt (PE / LCA) | `Shirt` |
| Pants | `Pants` |

**Size map:** `Extra Small` → `XS`, `Extra Large` → `XL`, `2XL`…`5XL` as labeled in RHET.

Drive dropdowns from `GET /catalog` when possible. Parse `variation` as `Gender · Type · Size` if structured gender/type/size are not yet on catalog items.

### 4.2 `POST /stock-requests` payload builder

For each local merchandise request line CMS already sends, ensure the RHET body matches:

```json
{
  "requestDate": "2026-07-23",
  "requestedBy": "<branch admin name>",
  "reason": "<reason, min 5 chars>",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Polo",
      "size": "S",
      "quantity": 2,
      "externalReference": "PSMS-29"
    }
  ]
}
```

Non-uniform example:

```json
{
  "categoryName": "Backpack",
  "itemName": "school-backpack",
  "quantity": 1,
  "externalReference": "PSMS-30"
}
```

Learning Kit example — **do not send this pass** (for future reference only; see STOCK_REQUEST_INTEGRATION.md §8).

```json
{
  "categoryName": "Learning Kit",
  "itemName": "grade-1-learning-kit",
  "quantity": 2,
  "externalReference": "PSMS-KIT-1001",
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
      "quantity": 2
    }
  ]
}
```

Rules:

1. One RHET `items[]` row per local request line (or batch multiple lines in one POST — both fine).
2. Always set `webhookUrl` from `INVENTORY_WEBHOOK_URL`.
3. Always set unique `externalReference` = `PSMS-<local_request_id>`.
4. Store returned `requestId`, `status`, `matchedSku`, `failureReason` on the local row.
5. If `failureReason` is present, set `inventory_status = FAILED` (or keep Pending with visible failure) and surface the reason in UI.

### 4.3 Catalog & availability proxies

Keep CMS proxies:

- `GET …/inventory/catalog` → RHET `GET /catalog`
- `GET …/inventory/availability` → RHET `GET /availability`

Use them to:

- Validate attributes before submit
- Prefill Merchandise Request Stock options
- For kits: pre-check **kit** and each **component** availability

### 4.4 Learning Kit UI — **blocked this pass**

Do **not** implement kit `components[]` in CMS yet.

| CMS work | Detail |
|---|---|
| Request Stock UI | Hide or disable `Learning Kit` with a clear message |
| Backend guard | Reject Learning Kit category before calling RHET |
| Docs / comments | Note deferred; future pass uses [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) §8 |
| Branch stock on kit fulfill | N/A while blocked; when enabled later, default recommendation is **kit item only** unless CMS stocks components separately |

### 4.5 Webhook handler (mostly keep)

Events:

| Event | CMS action |
|---|---|
| `stock_request.created` | Optional: confirm sync; do **not** write Approved By |
| `stock_request.fulfilled` | Idempotent branch stock add; status Approved; save Approved By |
| `stock_request.rejected` | Status Rejected; save reason + Approved By name |

Approved By pick order (keep):

```text
processedBy → approvedBy → processedByName → rejectedBy
```

Skip UUID-looking values. Never store `processedByUserId` as Approved By.

Match local row by:

1. `inventory_external_reference` / `externalReference` (`PSMS-#`)
2. else `inventory_request_id` / `requestId`

Respond HTTP 200 quickly. Rely on `sync-inventory` repair if webhook missed.

### 4.6 Branch stock apply on fulfill

`applyMerchandiseRequestStock.js` must still match the **branch merchandise row** that corresponds to what was requested.

| Request type | Suggested match key for `merchandisestbl` |
|---|---|
| Uniform | name/category + gender + type + size (same mapped labels) |
| Non-uniform | name / SKU |
| Learning Kit | **N/A this pass** (blocked). Later default: kit row only |

Idempotency: replaying the same fulfilled webhook must not double-add quantity.

### 4.7 UI copy / Superadmin

- While `inventory_request_id` is set and status pending → “Awaiting RHET Inventory” (no CMS Review).
- Show `inventory_rejection_reason` / `failureReason` when FAILED or REJECTED.
- Approved By column continues to use `inventory_processed_by`.

---

## 5. Sequence after alignment

```text
Admin Request Stock (CMS Merchandise)
        ↓
CMS saves Pending + externalReference PSMS-<id>
        ↓
CMS maps fields (exact RHET labels) → POST /stock-requests
        ↓  (Learning Kit blocked client/server-side)
RHET stores PENDING (+ matchedSku or failureReason)
        ↓
RHET admin Approves / Rejects
        ↓
Webhook → CMS
        ↓
FULFILLED → idempotent branch stock + Approved + Approved By name
REJECTED  → Rejected + reason + Approved By name
```

---

## 6. Verification plan (CMS + RHET staging)

1. **Auth** — CMS proxy `GET /catalog` returns 200.
2. **School Uniform Polo** — Request Male / Polo / S → appears in RHET with matched SKU `…POLO…` (not Shirt).
3. **PE Uniform** — Shirt / Pants maps correctly; approve deducts RHET; CMS branch stock increases once.
4. **Reject** — RHET reject → CMS Rejected + Approved By name; no stock add.
5. **Wrong type regression** — Temporarily send Polo as Shirt → expect `failureReason` / no match (proves mapping matters).
6. **Webhook Approved By** — Fulfill shows human name (e.g. `Abby`), never UUID.
7. **Idempotent fulfill** — Replay webhook or run sync repair → quantity not doubled.
8. **Learning Kit blocked** — category not selectable; backend rejects if forced.
9. **Legacy fallback** — With inventory env removed, CMS Superadmin approval path still works.

---

## 7. CMS code change summary (for implementers)

| Area | Action |
|---|---|
| `inventoryFieldMapping.js` | Harden gender/type/size/category maps; `isLearningKitCategory` for block guard |
| `inventoryClient.js` | Ensure POST body + `webhookUrl`; no kit `components` this pass |
| Merchandise Request Stock UI | Catalog-driven options; **block Learning Kit** |
| `applyMerchandiseRequestStock.js` | Confirm match keys after RHET attribute rename |
| Webhook / `approvedBy.js` | No change unless UUID leaks still occur |
| DB | No kit JSON column required this pass |
| Tests / repair scripts | Cover Polo≠Shirt; fulfill idempotency; kit blocked |

---

## 8. Ownership

| Layer | Owner |
|---|---|
| Central warehouse stock + approve/reject UI | RHET Inventory |
| Branch merchandise stock + Request Stock UX | CMS / PSMS |
| API contract, Learning Kit rules, webhooks | [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) |
| This file | CMS/PSMS alignment vs RHET inventory page changes |

When CMS checklist above is green and staging tests pass, production merchandise stock requests remain aligned with the updated RHET Inventory system.
