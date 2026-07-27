# CMS — Show Item Name on non-uniform merchandise stock tables

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Goal:** For non-uniform categories (Workbooks, Backpack, Book, Accessory, etc.), the branch **Stocks** table must show an **Item name** column so staff can tell which concrete item a quantity belongs to. Uniform categories keep Gender / Type / Size columns.

**Why:** Today “Stocks: Workbooks” often shows Gender/Type as `—` with only Quantity — impossible to identify which workbook when a category has multiple items.

**RHET side:** Already stores and returns `itemName`. This is a **CMS UI + data display** change only (no RHET API change required).

---

```markdown
## Task: CMS Merchandise Stocks — Item Name column for non-uniform categories

### Problem (current UI)
Screen: Merchandise → pick branch → open a type/category (e.g. **Workbooks**) → View Stocks

Table columns today (uniform-oriented):
| Gender | Type | Quantity | Price | Remarks |

For Workbooks / Backpack / Book / Accessory:
- Gender and Type are empty (`—`)
- Multiple different items can share the same category
- Staff only see Quantity (e.g. 10) with no way to know *which* item

### Goal
Make stock tables **category-aware**:

| Category kind | Columns to show |
|---|---|
| Uniform-like (School Uniform, PE Uniform, LCA T-Shirt, names ending with “Uniform”, etc.) | Gender, Type/Piece, Size (if you have it), Quantity, Price, Remarks |
| Non-uniform (Workbooks, Backpack, Book, Accessory, Other, …) | **Item name**, Quantity, Price, Remarks (optional SKU) |
| Learning Kit (if shown as local stock) | **Item name** (kit name), Quantity, Price, Remarks |

Do **not** force Gender/Type columns on non-uniform categories.

### Locked decisions
1. This is **CMS-local UI**. Do not call RHET Inventory to “configure columns.”
2. Do not invent fake Gender/Type values for workbooks/bags.
3. Item name must come from the merchandise stock row field you already persist (e.g. `merchandise_name`, `item_name`, `product_name`, or display name on `merchandisestbl`).
4. If the column is empty for existing rows, that is a **data** issue — still show the column; prefer backfill / edit so Request Stock + fulfill can match RHET by categoryName + itemName.
5. Keep RHET fulfill rule: merchandise **TYPE / category** = RHET `categoryName`; concrete product = **item name** (never create a new CMS type from RHET `itemName` like `lca-backpack`).
6. Browser still never calls RHET; only CMS backend uses the integration key.

### Where to change in CMS

1) **Stocks detail table** (primary — the broken screen)
   - Component/page that renders “Stocks: {CategoryName}”
   - Detect category kind (uniform vs non-uniform)
   - Render different column sets (see table above)
   - Item name column: use the stored merchandise/item name; show `—` only if truly missing

2) **Create / Add stock row / Edit merchandise** for non-uniform
   - Require **Item name** (same as Create Merchandise prompt § B)
   - Persist to the same DB field the stocks table will read
   - Optional: also store normalized RHET-style `item_name` (lowercase-hyphen) + display label

3) **Request Stock UI** (if not already)
   - Non-uniform: user must pick/select a concrete item (itemName), not category alone
   - Payload to RHET must include `itemName` (and sku when available)

4) **Fulfill webhook handler**
   - When RHET sends non-uniform fulfill: match branch row by
     `categoryName` (CMS type) + `itemName` (and/or sku)
   - Do not dump all Workbooks qty onto a single anonymous row

### How to detect uniform vs non-uniform

Prefer RHET catalog `categoryKind` if CMS already loads catalog:
- `SCHOOL_UNIFORM` | `PE_UNIFORM` | `LCA_SHIRT` → uniform columns
- `OTHER` | `LEARNING_KIT` → item name columns

If `categoryKind` is missing, use name heuristics (keep in sync with RHET):
- Uniform-like if category name is exactly / ends with Uniform, or is LCA T-Shirt / LCA Shirt
- Else non-uniform → show Item name

Examples non-uniform: Workbooks, Backpack, Book, Accessory, ID Lace, …

### Suggested Stocks table layouts

**Uniform**
| Gender | Type | Size | Quantity | Price | Remarks | Actions |

**Non-uniform**
| Item name | Quantity | Price | Remarks | Actions |

Optional extra for non-uniform: SKU (if stored).

### Data / empty Item name

If older Workbooks rows have qty but blank name:
1. Still show Item name column (empty or “Unnamed item”)
2. Allow Edit on the row to set item name
3. Prefer names that match RHET catalog `itemName` when the branch item is meant to sync with RHET (e.g. `nc-pk-worksheets`)
4. Do not hide the column because legacy data is incomplete

### Out of scope
- Changing RHET Inventory schema or UI
- Auto-creating RHET warehouse items from CMS
- Hard-coding a one-off “Workbooks only” exception — use the uniform vs non-uniform rule for **all** categories

### Acceptance tests
1. Open Stocks for **School Uniform** → still see Gender / Type / Size; no requirement to show Item name as primary identity.
2. Open Stocks for **Workbooks** (or Backpack) → **Item name** column visible; Gender/Type not shown as primary empty columns (or hidden).
3. Two different workbook items under Workbooks show as two rows with different Item names and their own quantities.
4. Create a new non-uniform merchandise row → Item name required → appears in Stocks table.
5. Request Stock for a workbook → sends RHET `categoryName` + `itemName` → RHET matches the correct SKU.
6. RHET fulfill webhook increases the CMS row that matches that item name (not a random Workbooks row).

### Do NOT
- Keep showing only Gender/Type for Workbooks
- Use RHET `itemName` as a new CMS merchandise **type** name
- Call RHET from the browser
- Assume one quantity per category is enough when multiple items exist
```

---

## Related RHET docs

- [CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md](./CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md) — create form must require item name for non-uniform
- [CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md](./CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md) — request picks concrete catalog item
- [CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md](./CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md) — fulfill by categoryName, credit by item identity
- [CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md](./CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md) — live catalog / categoryKind
