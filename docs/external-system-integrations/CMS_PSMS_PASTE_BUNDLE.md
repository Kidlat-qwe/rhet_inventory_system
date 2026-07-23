# CMS / PSMS — Self-contained paste bundle (RHET alignment)

**How to use:** In the **CMS / PSMS** Cursor chat, paste **everything inside the fenced block below** (from `## Task:` through the end of the block).  
This file is self-contained — you do **not** need `STOCK_REQUEST_INTEGRATION.md` or other RHET repo files in the CMS workspace.

**Decisions locked for this pass:**

| # | Decision |
|---|---|
| 1 | **Block Learning Kit** in Request Stock — uniform / non-kit attribute alignment only |
| 2 | All RHET contract details needed for this pass are **embedded below** |
| 3 | Kit fulfill → branch stock is **N/A** (kits blocked) |

---

```markdown
## Task: Align CMS/PSMS Merchandise stock requests with updated RHET Inventory

### Locked product decisions (do not re-ask)
1. Learning Kits: **BLOCK / hide** in Merchandise → Request Stock for this pass.
   Document kits as “not yet supported via CMS; request via RHET only / future work.”
   Do **not** implement `components[]` UI or kit fulfillment into merchandisestbl yet.
2. Scope: **uniform attribute alignment** (+ existing non-uniform itemName/sku path).
3. Kit branch-stock rule: **N/A** while kits are blocked.

### Context
Branch Admin “Request Stock” on Merchandise already forwards to RHET Inventory.
RHET now matches uniforms on structured attributes (exact gender / type / size labels).
Wrong mapping (especially Polo → Shirt) causes no match / failureReason.

PSMS and CMS are the same system. Frontend must **never** call RHET.

### Do not redesign the flow — keep
- POST /api/sms/merchandise-requests → save merchandiserequestlogtbl (Pending) → forward RHET
- externalReference = PSMS-<local_request_id>  (example: PSMS-29)
- Webhook POST /api/webhooks/inventory
- Superadmin does not approve RHET-integrated requests (“Awaiting RHET Inventory”)
- Approved By pick order: processedBy → approvedBy → processedByName → rejectedBy
  - Must be human display name; never UUID; never store processedByUserId as Approved By
  - Write inventory_processed_by on fulfill AND reject only (not on stock_request.created)
- Idempotent branch stock add on stock_request.fulfilled
- Legacy Superadmin approval when INVENTORY_API_URL / key missing

### Env (CMS backend only — never VITE_*)
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=<from RHET → API Keys>
INVENTORY_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
INVENTORY_SYSTEM_CODE=PSMS

Auth on every RHET call:
  X-Integration-Key: <INVENTORY_INTEGRATION_KEY>
  (or Authorization: Bearer <key>)

### RHET endpoints (via inventoryClient / proxies)
Base: INVENTORY_API_URL

| Method | Path | Purpose |
|---|---|---|
| GET | /catalog | Categories + sellable items — drive dropdowns |
| GET | /availability | Optional pre-check |
| POST | /stock-requests | Submit request line(s) |
| GET | /stock-requests/:id | Optional poll / sync repair |

Envelope success: { "success": true, "data": … }
Envelope error:   { "success": false, "error": { "code", "message", "details?" } }

---

### Exact RHET matching rules (this pass)

#### Uniform-like categories
Examples: School Uniform, PE Uniform, LCA T-Shirt (and names ending with " uniform").

Match key:
  categoryName + gender + type + size  →  one RHET inventory row

| Field | Allowed RHET values |
|---|---|
| gender | Male, Female, Unisex (School Uniform typically has no Unisex in RHET UI) |
| type | Polo, Short, Blouse, Skirt, Shirt, Pants — **exact** |
| size | XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL |

CRITICAL: Polo ≠ Shirt. If user picks Polo, send type "Polo". Sending "Shirt" will not match Polo stock.

#### Non-uniform categories
Examples: Backpack, Book, Accessory, …

Match key:
  categoryName + itemName and/or sku

Prefer values from GET /catalog. Item names in RHET are typically lowercase with hyphens.

#### Learning Kit
OUT OF SCOPE this pass. Hide/block categoryName "Learning Kit" in Request Stock.
If somehow submitted without components, RHET will set failureReason — CMS should reject client-side first.

---

### CMS → RHET field mapping (update inventoryFieldMapping.js)

| CMS concept | RHET categoryName | gender | type | size / other |
|---|---|---|---|---|
| School / LCA Uniform · Polo | School Uniform | Male / Female | Polo | XS…5XL |
| School Uniform · Short | School Uniform | Male | Short | … |
| School Uniform · Blouse / Skirt | School Uniform | Female | Blouse / Skirt | … |
| PE Uniform · Shirt / Pants | PE Uniform | Male / Female / Unisex | Shirt / Pants | … |
| LCA T-Shirt | LCA T-Shirt | usually Unisex | Shirt | … |
| Backpack / Book / etc. | exact catalog name | — | — | itemName and/or sku |

Gender labels:
  Men / Male → Male
  Women / Female → Female
  Unisex → Unisex

Size labels:
  Extra Small → XS, Small → S, Medium → M, Large → L,
  Extra Large → XL, then 2XL…5XL as labeled.

Prefer building options from GET /catalog.
Catalog item.variation is often display text like "Male · Polo · S" — parse if structured fields are absent on catalog rows.

---

### POST /stock-requests body shape

{
  "requestDate": "2026-07-23",
  "requestedBy": "<branch admin name, 2–150 chars>",
  "reason": "<reason, 5–500 chars>",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "items": [ /* 1–50 lines */ ]
}

Uniform item example:
{
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Polo",
  "size": "S",
  "quantity": 2,
  "externalReference": "PSMS-29"
}

Non-uniform item example:
{
  "categoryName": "Backpack",
  "itemName": "school-backpack",
  "quantity": 1,
  "externalReference": "PSMS-30"
}

Do NOT send Learning Kit items in this pass.

After RHET responds 201, store on merchandiserequestlogtbl:
  inventory_request_id
  inventory_status          (PENDING / FAILED if failureReason)
  inventory_external_reference
  inventory_matched_sku
  inventory_rejection_reason / failure reason if present
  inventory_synced_at

---

### GET /availability (optional)

Uniform:
  GET /availability?categoryName=School%20Uniform&gender=Male&type=Polo&size=S

Non-uniform:
  GET /availability?categoryName=Backpack&itemName=school-backpack

Use before submit to warn OUT_OF_STOCK / no match.

---

### Webhooks (keep existing handler; harden Approved By)

RHET POSTs to INVENTORY_WEBHOOK_URL.

| event | CMS action |
|---|---|
| stock_request.created | Optional sync confirm; do NOT set Approved By |
| stock_request.fulfilled | Find by externalReference (PSMS-#) or inventory_request_id; idempotent add qty to merchandisestbl; status Approved; inventory_processed_by = display name |
| stock_request.rejected | Mark Rejected; save rejectionReason; inventory_processed_by = display name; NO stock add |

Example fulfilled payload fields:
  event, requestId, externalReference, sourceSystem, status=FULFILLED,
  categoryName, gender, type, size, quantity, matchedSku, inventoryId,
  processedBy, approvedBy, processedByName, processedByUserId, processedAt, timestamp

Respond HTTP 200 quickly. Repair: POST /api/sms/merchandise-requests/:id/sync-inventory

---

### CMS code touchpoints to update

Frontend:
- frontend/src/pages/admin/adminMerchandise.jsx
- frontend/src/pages/superadmin/Merchandise.jsx
- frontend/src/utils/merchandiseRequests/approvedBy.js

Backend:
- backend/routes/merchandiserequests.js
- backend/routes/inventoryWebhooks.js
- backend/services/inventory/inventoryClient.js
- backend/services/inventory/inventoryFieldMapping.js
- backend/services/inventory/applyMerchandiseRequestStock.js
- repair scripts / sync-inventory

### Required implementation work

1) inventoryFieldMapping.js
   - Harden gender / type / size / category maps as above
   - NEVER map Polo → Shirt
   - Add helper isLearningKitCategory(name) → true for "Learning Kit"

2) Request Stock UI
   - Prefer catalog-driven options for uniforms
   - BLOCK Learning Kit: hide from category picker OR show disabled with message
     "Learning Kits are not available via Request Stock yet."
   - Backend guard: if category is Learning Kit, reject before calling RHET

3) inventoryClient.js / create merchandise request
   - Always send webhookUrl + externalReference PSMS-<id>
   - Persist RHET ids / status / matchedSku / failureReason
   - No components[] required this pass (kits blocked)

4) applyMerchandiseRequestStock.js
   - Match branch merchandisestbl by same mapped attributes (gender/type/size or itemName)
   - Keep fulfill idempotent (replay webhook must not double-add)

5) Docs / comments in CMS
   - Note Learning Kit deferred; future pass will need components[] per RHET kit BOM

### Out of scope this pass
- Learning Kit components UI / payload / fulfillment
- Shopee / channel allocation
- Calling RHET from the browser
- Changing RHET schema
- Asking the user for missing RHET .md files (this prompt is complete)

### Optional: live catalog for exact names
If env is configured, call GET /catalog once and derive exact categoryName / variation labels from production/staging.
Do not invent category names that are not in catalog.

### Test before merge
1. Catalog proxy returns 200
2. Request Male + Polo + S → RHET shows matched SKU containing POLO (not Shirt)
3. Approve in RHET → webhook → branch stock increases once; Approved By = human name
4. Reject in RHET → Rejected + reason + Approved By name; no stock add
5. Replay webhook / sync-inventory → no double stock
6. Learning Kit not selectable (or blocked with clear error)
7. Legacy path (inventory env off) still uses CMS Superadmin approval

### Done when
Uniform (and existing non-kit) Request Stock still syncs with RHET after inventory page changes, without Learning Kit support in CMS.
```
