# CMS — Request Stock must use `categoryKind` (fix Shirt / LCA_SHIRT)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**RHET change required?** **No.** RHET Inventory is correct. This is a **CMS-only** Request Stock UI + mapping fix.

**Symptom (2026-07-30):**
- CMS Request Stock → category **Shirt** → form shows only Category / Item / Qty.
- Submit → Notice: `Row 1 (Shirt): Gender, type, and size are required for uniform items`
- That error is from RHET: category `Shirt` has `categoryKind = LCA_SHIRT` (uniform-like).

**Root cause:**
CMS still decides uniform vs non-uniform by **category name heuristics** (School Uniform, PE Uniform, “LCA T-Shirt”, ends with “uniform”).  
Plain name **`Shirt`** does not match those heuristics → CMS shows **Item** picker.  
RHET uses **`categoryKind`** → requires **gender + type + size**.

Also: for Shirt / LCA Shirt, RHET **type** values are **`Logo 1`** / **`Logo 2`** (UI label “Logo”), **not** `Shirt`.

---

```markdown
## Task: CMS Request Stock — drive form from RHET `categoryKind` (fix Shirt)

### Locked architecture (do not redesign)
Keep the current CMS ↔ RHET integration as-is:

- Browser NEVER calls RHET; CMS backend proxies with X-Integration-Key.
- Env: INVENTORY_API_URL, INVENTORY_INTEGRATION_KEY (or INVENTORY_API_KEY),
  INVENTORY_WEBHOOK_URL, INVENTORY_SYSTEM_CODE=PSMS
- Catalog: GET /api/sms/merchandise-requests/inventory/catalog → RHET GET /catalog
- Availability (optional): GET …/inventory/availability → RHET GET /availability
- Submit: POST /api/sms/merchandise-requests
  → save merchandiserequestlogtbl (Pending)
  → POST RHET /stock-requests with webhookUrl
- Webhook: POST /api/webhooks/inventory
  → fulfilled: applyMerchandiseRequestStock (credit merchandisestbl)
  → rejected/failed: mark Rejected
- One local request row → one RHET line; externalReference = PSMS-<local_id>
- Merchandise TYPE name = RHET categoryName only (never create type from itemName)

### Observed bug
Request Merchandise Stock modal:
- Row: CATEGORY = Shirt, ITEM = (empty/unused), QTY = 1
- Notice: "Row 1 (Shirt): Gender, type, and size are required for uniform items"

RHET Inventory Add merchandise for Shirt correctly shows:
- Gender (Unisex)
- Logo (Logo 1 / Logo 2)  ← this is RHET `type` / uniform_type
- Size (XS–XL, Teen)

So CMS Request Stock must mirror that for Shirt, not the Workbooks Item picker.

### RHET matching rules (source of truth)

Prefer catalog.categories[].categoryKind:

| categoryKind | Form mode | Required fields on RHET item |
|---|---|---|
| SCHOOL_UNIFORM | Uniform | gender + type + size |
| PE_UNIFORM | Uniform | gender + type + size |
| LCA_SHIRT | Uniform (Shirt / LCA Shirt) | gender + type + size |
| LEARNING_KIT | Kit (existing kit path) | itemName/sku + components[] |
| OTHER (or missing kind + not kit) | Non-uniform | itemName + sku |

Name heuristics are FALLBACK only when categoryKind is missing:
- Uniform-like if name is School Uniform / PE Uniform / LCA T-Shirt / LCA Shirt /
  Shirt / ends with " uniform" / (contains "lca" AND "shirt")
- Else non-uniform

CRITICAL: category name **"Shirt"** with kind **LCA_SHIRT** is UNIFORM even though
the name does not end with "Uniform".

### Shirt / LCA_SHIRT field values (exact)

From live RHET catalog items in that category (do not hard-code if catalog has options):

- gender: usually **Unisex** only
- type: **Logo 1**, **Logo 2**  (CMS may label the dropdown "Logo")
- size: from catalog (typically XS, S, M, L, XL, Teen — not necessarily 2XL–5XL)

FORBIDDEN for Shirt / LCA_SHIRT:
- Showing only an "Item" dropdown and submitting itemName/sku without gender/type/size
- Sending type = "Shirt" (that is PE Uniform piece type, NOT LCA Shirt logo type)
- Sending type = "Polo" for Shirt category
- Inventing gender/type/size not present on catalog items for that category

Example RHET payload item for Shirt:
```json
{
  "categoryName": "Shirt",
  "gender": "Unisex",
  "type": "Logo 1",
  "size": "M",
  "quantity": 1,
  "externalReference": "PSMS-<local_request_id>"
}
```

Do NOT send itemName/sku for this uniform path (unless RHET catalog also returns them
as informational — matching keys are gender/type/size).

### Request Stock UI requirements

After Category selected from catalog.categories:

1) Resolve kind = selectedCategory.categoryKind (preferred) or name heuristic.

2) If kind is SCHOOL_UNIFORM | PE_UNIFORM | LCA_SHIRT:
   - Hide Item name picker (or disable it).
   - Show Gender / Type / Size dropdowns.
   - For LCA_SHIRT, label Type dropdown as **Logo** in UI if desired, but POST field
     remains `type` with values like "Logo 1".
   - Options MUST be derived from catalog.items filtered by categoryName:
     - unique uniformGender / gender
     - unique uniformType / type (or parse variation "Gender · Type · Size")
     - unique uniformSize / size
   - Block submit until gender + type + size + qty + reason are set.

3) If kind is OTHER (Backpack, Workbooks, …):
   - Show Item dropdown (itemName + sku from same catalog row) — existing path.
   - Require itemName and sku.

4) If LEARNING_KIT:
   - Keep existing kit + components[] path (do not break).

5) Validation message before calling RHET should match the mode:
   - Uniform: "Gender, logo/type, and size are required for Shirt / uniform items"
   - Non-uniform: "Item and SKU are required"

### Mapping / submit (inventoryFieldMapping.js + merchandiserequests.js)

- When building RHET items[]:
  - Always send exact categoryName from catalog.
  - Uniform kinds → include gender, type, size; omit empty itemName/sku or leave unset.
  - Non-uniform → include itemName + sku from selected catalog item.
- Persist on merchandiserequestlogtbl before/after RHET call:
  inventory_category_name, and for uniforms also store gender/type/size on whatever
  columns you already use; for non-uniform keep inventory_item_name / inventory_requested_sku.

### Fulfill (applyMerchandiseRequestStock.js) — Shirt

On stock_request.fulfilled for categoryName "Shirt":
- Find/create merchandise TYPE = "Shirt" (categoryName), never "Logo 1".
- Under that type, match/create stock row by gender + type(Logo) + size
  (same as other uniforms).
- Do not use non-uniform item_name fallback for LCA_SHIRT.

### Files to inspect/change (CMS)
- frontend Request Stock modal (adminMerchandise / merchandiseRequests utils)
- Any isUniformCategoryName / categoryKind helpers
- backend/services/inventory/inventoryFieldMapping.js
- backend/routes/merchandiserequests.js (validation before proxy)
- backend/services/inventory/applyMerchandiseRequestStock.js (Shirt row match)
- Catalog proxy response usage — ensure categoryKind is passed through to the UI

### Acceptance tests
1. Catalog shows category { categoryName: "Shirt", categoryKind: "LCA_SHIRT" }.
2. Request Stock select Shirt → UI shows Gender + Logo/Type + Size (NOT Item-only).
3. Select Unisex + Logo 1 + M + qty → submit succeeds; RHET Pending shows matched SKU
   (not failureReason about gender/type/size).
4. Attempt submit Shirt without gender/type/size → CMS blocks locally with clear message
   (should not rely only on RHET error notice).
5. Workbooks/Backpack still use Item + SKU path.
6. School Uniform still uses Gender + Type (Polo/…) + Size.
7. PE Uniform still uses Gender + Type (Shirt/Pants) + Size — PE type "Shirt" is fine
   under PE Uniform only; it must not be used as LCA_SHIRT type.
8. Fulfill Shirt → branch Stocks under type Shirt get a row for that Logo + size
   (not a blank anonymous row).

### Do NOT
- Change RHET Inventory for this bug
- Hard-code only "LCA T-Shirt" as uniform and ignore categoryKind LCA_SHIRT / name "Shirt"
- Map Logo 1/Logo 2 → type "Shirt"
- Call RHET from the browser
- Create CMS merchandise TYPE named Logo 1 / Logo 2
```

---

## Current CMS architecture (reference — already implemented)

Keep this contract; only fix uniform detection + Shirt field mapping as above.

- Catalog proxy → RHET `/catalog`
- Submit → local Pending + RHET `POST /stock-requests`
- Webhook → fulfill/reject branch stock
- Uniforms: `categoryName + gender + type + size`
- Non-uniform: `categoryName + itemName + sku`
- Learning Kit: `components[]` + branch type Learning Kit

## Related

- [CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md](./CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md) — original Request Stock redesign
- [CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md](./CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md) — live catalog dropdowns
- [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) — RHET API contract
- [CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md](./CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md) — type = categoryName
