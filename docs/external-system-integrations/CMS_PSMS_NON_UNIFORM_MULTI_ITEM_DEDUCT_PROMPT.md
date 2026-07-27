# CMS — Fix non-uniform multi-item deduct (Workbooks / Backpack / etc.)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**RHET change required?** **No.** Warehouse matching already uses `categoryName + itemName` and/or `sku`. This is a **CMS-only** fix.

**Symptom:**
- External/CMS requests stock for **Workbooks** (or another non-uniform category) with **different item names**.
- RHET (or CMS branch stock) only moves **one** item every time.
- Uniforms may work; Workbooks/Backpack look broken.

**Context:** CMS already documents the correct design (catalog dropdowns, `item_name`/`sku` on `merchandisestbl`, fulfill by item under type). Runtime code or data is not following that design.

---

```markdown
## Task: CMS — different Workbooks (non-uniform) items must match/deduct/credit different rows

### Confirmed architecture (do not redesign)
- Browser NEVER calls RHET; CMS backend uses X-Integration-Key.
- Env: INVENTORY_API_URL, INVENTORY_INTEGRATION_KEY (or INVENTORY_API_KEY), INVENTORY_WEBHOOK_URL, INVENTORY_SYSTEM_CODE=PSMS
- Catalog: GET /api/sms/merchandise-requests/inventory/catalog → RHET /catalog
- Submit: local merchandiserequestlogtbl + POST RHET /stock-requests with webhookUrl
- Webhook: POST /api/webhooks/inventory → FULFILLED adds branch stock / REJECTED updates status
- CMS merchandise TYPE (merchandise_name) = RHET categoryName (e.g. Workbooks)
- NEVER create a CMS type from RHET itemName (e.g. nc-pk-worksheets)

### RHET matching (source of truth — CMS must feed it correctly)

UNIFORM-LIKE:
  categoryName + gender + type + size

NON-UNIFORM (Workbooks, Backpack, Book, Accessory, …):
  categoryName + itemName + sku   ← ALL required for reliable multi-item categories
  Example A: Workbooks / nc-pk-worksheets / WOR-NC-PK-…
  Example B: Workbooks / nc-kg-worksheets / WOR-NC-KG-…

If CMS sends only categoryName "Workbooks", or always the same itemName/sku,
RHET will keep matching (and deducting) the same warehouse SKU.

### Root-cause checklist (fix the failing path)

A) REQUEST STOCK SUBMIT (most common)
   - UI must force picking a concrete catalog **item** for non-uniform categories (not category alone).
   - Payload to RHET must include exact catalog:
       categoryName, itemName, sku, quantity, externalReference (PSMS-<id>)
   - Persist on request log BEFORE calling RHET:
       inventory_category_name
       inventory_item_name
       inventory_requested_sku
       (+ inventory_request_id / inventory_external_reference after success)
   - Verify in inventoryFieldMapping.js / merchandiserequests.js that itemName/sku are not dropped or overwritten with category name.

B) BRANCH STOCK ROWS (merchandisestbl)
   - Under type Workbooks there must be **one row per concrete item** with item_name (and sku when known).
   - Migration 133 (item_name + sku) must be applied on this environment.
   - Legacy rows with blank item_name: backfill or edit; do not leave multiple anonymous qty rows.

C) FULFILL (applyMerchandiseRequestStock.js)
   Match order MUST be:
   1. Prefer merchandise/stock id saved on the local request at submit time (if present).
   2. Find CMS type by RHET categoryName (Workbooks) — case-insensitive.
   3. Under that type, find stock row by item_name and/or sku (case-insensitive / normalized).
   4. If no row: CREATE a stock row under Workbooks with that item_name + sku (do not create a new TYPE named after itemName).
   5. FORBIDDEN when item_name/sku present: fall back to “first Workbooks row” / “single anonymous row for the type”.
   6. Idempotent on externalReference / webhook re-delivery.

D) DIAGNOSE WITH RHET UI (do this before coding if possible)
   Open two Workbooks requests that should be different items:
   - If Matched SKU is THE SAME → fix path A (submit/mapping/UI).
   - If Matched SKUs DIFFER but CMS branch qty only moves on one row → fix path C (fulfill) and/or B (blank item_name data).

### Implementation requirements

1) Request Stock UI (non-uniform)
   - After category = Workbooks (etc.), show item dropdown from catalog.items filtered by categoryName.
   - Display: itemName, sku, stocks.
   - Block submit unless itemName (and sku if catalog has sku) selected.
   - Do not allow “category-only” submit for non-uniform.

2) Submit mapper
   - Map selected catalog item → RHET body itemName + sku exactly (trim; do not rewrite to merchandise type name).
   - externalReference = PSMS-<localRequestId> unique per line.

3) Fulfill applier
   - Split helpers if needed:
       findOrCreateMerchandiseType(branch, categoryName)
       findOrCreateStockRow(type, { itemName, sku, gender, type, size })
   - Non-uniform findOrCreateStockRow MUST key on itemName/sku.
   - Remove or narrow any “default single row per type” fallback so it never runs when inventory_item_name / webhook itemName / matchedSku is present.

4) Stocks UI (if not done)
   - Non-uniform columns: Item name | SKU | Qty | Price | Remarks
   - Makes multi-item Workbooks visible for QA.

5) Data repair (ops)
   - Apply migration 133 everywhere.
   - For existing Workbooks rows with qty but null item_name: set item_name/sku to match RHET catalog items used by that branch, or merge duplicates carefully.
   - Re-test with two different workbook catalog items.

### Acceptance tests
1. Catalog shows ≥2 Workbooks items with different itemName/sku.
2. Request item A → RHET Pending shows Item name A + Matched SKU A.
3. Request item B → RHET Pending shows Item name B + Matched SKU B (≠ A).
4. Approve A → RHET warehouse SKU A decreases; CMS Workbooks row for A increases.
5. Approve B → RHET warehouse SKU B decreases; CMS Workbooks row for B increases (A unchanged).
6. Webhook re-delivery for same externalReference does not double-add.
7. Fulfill never creates a new CMS type named like nc-pk-worksheets when type Workbooks already exists.

### Files to inspect/change (CMS)
- backend/services/inventory/inventoryFieldMapping.js
- backend/services/inventory/applyMerchandiseRequestStock.js
- backend/routes/merchandiserequests.js
- backend/routes/inventoryWebhooks.js
- frontend Request Stock (non-uniform item picker)
- frontend/src/utils/merchandiseRequests/*
- frontend/src/utils/merchandiseStock/* (columns + row identity)
- Confirm migration 133 on the environment under test

### Do NOT
- Change RHET Inventory for this bug (unless Matched SKU is wrong *despite* correct itemName+sku in the POST body — then capture the POST payload and escalate).
- Send only categoryName for Workbooks.
- Fall back to one anonymous Workbooks stock row when item identity exists.
- Create CMS merchandise TYPE from RHET itemName.
- Call RHET from the browser.
```

---

## Related

- [CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md](./CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md) — Stocks table Item name column
- [CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md](./CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md) — catalog item picker
- [CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md](./CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md) — type = categoryName
- [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) — RHET API contract
