# CMS — Catalog-driven category dropdowns (no hard-coded lists)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Goal:** CMS category (and related item) dropdowns load from RHET Inventory `GET /catalog` via the existing CMS backend proxy — not from hard-coded category name arrays.

---

```markdown
## Task: CMS category / merchandise dropdowns must use RHET Inventory catalog API (no hard-coded category lists)

### Goal
All CMS dropdowns that choose a merchandise **category** (and related item options) must load from the **RHET Inventory** integration catalog via the CMS backend proxy — not from hard-coded arrays like ["School Uniform", "PE Uniform", "Backpack", …].

This keeps CMS aligned when RHET adds/renames categories (e.g. Junior School Uniform, new accessory categories) without a CMS code deploy for each new name.

### Do not break existing integration
Keep:
- Browser NEVER calls RHET; only CMS backend uses X-Integration-Key
- Env: INVENTORY_API_URL, INVENTORY_INTEGRATION_KEY (or INVENTORY_API_KEY), INVENTORY_WEBHOOK_URL, INVENTORY_SYSTEM_CODE=PSMS
- Request Stock → save local → POST RHET /stock-requests → webhook fulfill/reject
- Fulfill rule: CMS merchandise TYPE = RHET categoryName (never create type from itemName like lca-backpack)
- Learning Kit flow with components[] + recipe map (if already implemented)
- Legacy Superadmin approval when inventory env is missing

### Source of truth for dropdowns
CMS already has (or must use):

  GET /api/sms/merchandise-requests/inventory/catalog
    → proxies RHET GET {INVENTORY_API_URL}/catalog

Response shape (typical):
{
  "categories": [
    { "categoryId": "uuid", "categoryName": "School Uniform" },
    { "categoryId": "uuid", "categoryName": "Backpack" },
    { "categoryId": "uuid", "categoryName": "Learning Kit" }
  ],
  "items": [
    {
      "inventoryId": "uuid",
      "sku": "BAC-LCA-BACKPACK",
      "itemName": "lca-backpack",
      "stocks": 11,
      "status": "ACTIVE",
      "variation": "…",
      "categoryName": "Backpack"
    }
  ]
}

Use **exact** categoryName strings from this response everywhere CMS previously hard-coded categories.

### Where to replace hard-coded lists

1) Superadmin → Create / Add Merchandise Type (branch)
   - Category dropdown = catalog.categories (categoryName)
   - NOT a fixed CMS constant list
   - Still LOCAL ONLY create (does not create RHET warehouse items)
   - Persist merchandise_name / type = selected categoryName

2) Branch Admin → Request Stock
   - Category dropdown = catalog.categories
   - After category selected:
     - Uniform-like: build gender/type/size options from catalog.items in that category
       (and/or existing mapping helpers keyed by categoryName from catalog, not a frozen enum of categories)
     - Non-uniform: item dropdown = catalog.items filtered by categoryName (show itemName, sku, stocks)
     - Learning Kit: kit dropdown = items where categoryName === "Learning Kit"; then component collectors from recipe + catalog

3) Any other merchandise filters / forms that list categories
   - Same catalog source

### Implementation requirements

A) Catalog load
- On opening Create Merchandise Type and Request Stock, fetch inventory catalog via CMS proxy
- Show loading / error / retry if RHET is down (existing 502 handling / short cache OK)
- If inventory env missing (legacy mode), keep legacy UX; do not invent RHET names

B) Remove / stop using hard-coded category name arrays as the primary source
- Search codebase for hard-coded lists: School Uniform, PE Uniform, LCA T-Shirt, Backpack, Learning Kit, Tool Kit, Workbooks, Accessory, etc. used for dropdowns
- Replace with catalog-driven options
- Optional: keep small helpers for *behavior* (isUniformCategoryName heuristics) but drive the *options list* from API

C) Exact-name discipline
- Never map Men→Male incorrectly; keep existing RHET label maps for gender/type/size values
- Category option value/label = RHET categoryName exactly
- After RHET adds a new category, it must appear on next successful catalog fetch without CMS redeploy for a new hard-coded entry

D) Caching
- Brief in-memory/cache of catalog is OK for performance
- Provide manual refresh or re-fetch when opening the modal
- Do not cache forever; stale cache hides new RHET categories/items

### Out of scope
- Push-sync creating CMS merchandisestbl rows when RHET adds an item
- Calling RHET from the browser
- Changing RHET schema
- Renaming existing RHET canonical categories CMS already depends on

### Acceptance tests
1. RHET Categories page has Backpack, School Uniform, Learning Kit, etc. → CMS Create Merchandise Type dropdown shows the same names from catalog.
2. Add a new category in RHET (unique name) → after catalog refresh, it appears in CMS category dropdowns.
3. Add item lca-stringbag under Backpack in RHET → Request Stock → Backpack → item list includes lca-stringbag (no CMS hard-code).
4. With inventory env disabled, legacy flow still works.
5. Fulfill still matches TYPE by categoryName (Backpack), not itemName.
6. No remaining primary UI dropdown backed only by a hard-coded category name array (grep to verify).

### Done when
CMS category (and dependent item) dropdowns are fully catalog-driven from RHET via the existing inventory proxy, with no hard-coded category list as the source of truth.
```
