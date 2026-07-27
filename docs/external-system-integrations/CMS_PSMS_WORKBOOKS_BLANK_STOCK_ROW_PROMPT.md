# CMS — Non-uniform Stocks blank Item name (Workbooks, Backpack, …)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**RHET change required?** **No.** This is **CMS-only** (fulfill + persist `item_name`/`sku` + data repair).

**Scope:** **All non-uniform** merchandise types — Workbooks, Backpack, Book, Accessory, etc. — **not Workbooks-only**. Uniforms keep Gender/Type/Size.

---

**Evidence A — Workbooks (2026-07-27)**

My Requests (correct — distinct items):

| Merchandise | Item / SKU | Qty |
|---|---|---|
| Workbooks | `nc-pk-worksheets` / `WOR-NC-KG-WORKSHEETS` | 5 |
| Workbooks | `kg-gs-workbooks` / `WOR-GS-WORKBOOKS` | 5 |

Stocks: Workbooks (wrong — one anonymous row):

| Item name | SKU | Quantity |
|---|---|---|
| — | — | **15** |

**Evidence B — Backpack (2026-07-27)**

User requested a **string bag** (concrete item under Backpack).

Stocks: Backpack shows:

| Item name | SKU | Quantity | Price |
|---|---|---|---|
| — | — | **18** | ₱500.00 |

Expected: a row with Item name like `string-bag` / `lca-string-bag` (or the catalog `itemName`), not a blank row under the type **Backpack**.

The Stocks **column** for Item name already exists (UI applied). The **value** is blank because fulfill/create never writes `item_name`/`sku` onto the stock row — it only bumps qty on the anonymous type row.

---

```markdown
## Task: CMS — persist and match Item name + SKU for ALL non-uniform Stocks rows

### Scope (mandatory)
Apply this to EVERY non-uniform merchandise type:
  Workbooks, Backpack, Book, Accessory, ID Lace, Other, …
NOT Workbooks-only. NOT Backpack-only.

Uniforms (School Uniform, PE Uniform, LCA Shirt, …) keep Gender / Type / Size — do not force Item name as primary identity there.

Learning Kit: show kit Item name the same way as other non-uniform.

### Observed bugs

1) Workbooks: My Requests has distinct itemName/sku, but Stocks has one row Item name —, SKU —, qty piled together.
2) Backpack: user requested **string bag**; Stocks: Backpack still shows Item name —, SKU —, qty 18, price ₱500.
   Staff only see the category “Backpack”, not which bag (string bag vs other backpack SKUs).

### Root cause
Stocks UI column exists, but:
- Fulfill (`applyMerchandiseRequestStock.js`) credits the first/blank stock row under the TYPE (Workbooks / Backpack) and does NOT set item_name + sku.
- Create merchandise / add stock for non-uniform may also leave item_name null.
- Matching ignores request inventory_item_name / webhook itemName / matchedSku.

### Required fix

On FULFILLED webhook for non-uniform:

1. Resolve CMS TYPE by RHET categoryName (e.g. "Backpack", "Workbooks") — case-insensitive.
   NEVER create a new TYPE from itemName (e.g. do not create type "string-bag" or "lca-backpack").

2. Under that type, find stock row by item_name and/or sku from:
   - request log: inventory_item_name, inventory_requested_sku
   - webhook: itemName, sku, matchedSku
   Match case-insensitive / trimmed.

3. If no row: CREATE under that type with item_name + sku SET (not null), then set qty.
   Example: type Backpack + item_name = string-bag (or catalog name) + sku = BAC-… 

4. If row found: ADD qty (idempotent on externalReference).

5. FORBIDDEN when request has item identity:
   - Credit a row where item_name IS NULL and sku IS NULL
   - “Find any stock under Backpack/Workbooks”

6. Create Merchandise / Add stock / Edit for non-uniform:
   - Require Item name (and SKU when known from catalog)
   - Persist to the same DB fields Stocks table reads

7. Request Stock submit (verify still OK):
   - Must send categoryName + itemName + sku from the SAME catalog row
   - My Requests already shows item subtitles for Workbooks — keep that for Backpack too

### Data repair (ops)

For branches with blank Backpack / Workbooks rows (qty on Item name —):
1. After code fix, new fulfills must create identified rows (do not keep adding to blank).
2. Reconcile legacy blank qty using My Requests / RHET history (e.g. assign string-bag portion of Backpack qty 18, or split Workbooks 15).
3. Edit blank rows to set item_name/sku when the whole qty is one known item; otherwise split then remove empty blank rows.

### Acceptance tests

Backpack:
1. Request Stock: Backpack + string bag (catalog itemName/sku) → Approved
2. Stocks: Backpack shows a row with Item name = that string-bag name, SKU filled, qty increased
3. Blank Item name row does NOT increase
4. Second different backpack item → second Stocks row

Workbooks:
5. Two different workbook items → two Stocks rows with Item name + SKU filled

General:
6. School Uniform Stocks still Gender/Type/Size (unchanged)
7. No new merchandise TYPE named after itemName
8. Webhook re-delivery does not double-add

### Files (CMS)
- backend/services/inventory/applyMerchandiseRequestStock.js  ← primary
- backend/services/inventory/inventoryFieldMapping.js
- backend/routes/inventoryWebhooks.js
- Create/Edit merchandise + stock helpers
- Stocks table already has columns — ensure it reads item_name/sku fields

### Do NOT
- Change RHET Inventory for this bug
- Hard-code Workbooks-only or Backpack-only exceptions
- Keep adding qty to anonymous (null item_name) rows
- Create CMS TYPE from RHET itemName
- Call RHET from the browser
```

---

## Related

- [CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md](./CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md) — column layout (already largely done if you see Item name header)
- [CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md](./CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md) — broader multi-item checklist
- [CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md](./CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md) — type = categoryName
