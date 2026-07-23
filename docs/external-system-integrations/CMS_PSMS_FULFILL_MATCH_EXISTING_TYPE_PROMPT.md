# CMS — Fulfill must add stock to existing merchandise type (not create `lca-backpack`)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Symptom:**
- Superadmin already has merchandise type **Backpack** on the branch (qty was 0).
- Branch Admin requested stock (RHET category Backpack, item `lca-backpack`, SKU `BAC-LCA-BACKPACK`).
- RHET approved → CMS Approved.
- Notes: `Stock created on branch` / `BAC-LCA-BACKPACK`.
- CMS created a **new** type **`lca-backpack`** (qty 4) instead of adding qty to existing **Backpack**.

---

```markdown
## Task: On RHET fulfill, add stock to the existing CMS merchandise type — do not create a new type from RHET itemName

### What happened
CMS branch already had merchandise category/type: **Backpack**
After RHET fulfill for a backpack request, CMS created another type: **lca-backpack** with quantity 4.

Approval notes said something like:
  Auto-approved: RHET Inventory fulfilled this request (BAC-LCA-BACKPACK) by Abby. Stock created on branch.

That means applyMerchandiseRequestStock (or equivalent) failed to match the existing **Backpack** type and fell back to **create new merchandise** using RHET `itemName` (`lca-backpack`) or SKU slug.

### RHET identity vs CMS identity (important)

In RHET Inventory:
- **categoryName** = merchandise family, e.g. `Backpack`  ← matches CMS "merchandise type / category"
- **itemName** = specific SKU row name, e.g. `lca-backpack`  ← NOT a new CMS category
- **matchedSku** = e.g. `BAC-LCA-BACKPACK`
- uniforms also have gender / type / size

In CMS Merchandise UI:
- Cards like School Uniform, PE Uniform, **Backpack** = category/type buckets
- "View Stocks" / stock rows = items inside that bucket

So fulfill must resolve:
  RHET categoryName "Backpack"  →  existing CMS type "Backpack"
then add quantity to a stock row under that type — NOT create a new top-level type named after itemName.

### Required matching order for fulfill (non-uniform)

When applying `stock_request.fulfilled` for a branch:

1. Prefer link stored on the local request at submit time
   - If request already has local merchandise_id / stock_id / type_id → use that. Add qty there.

2. Else match existing CMS merchandise **type/category** by RHET `categoryName` (case-insensitive)
   - "Backpack" → existing Backpack type on that branch
   - Do NOT require type name === itemName

3. Under that type, find or create a **stock row** (merchandisestbl) by:
   - Prefer SKU if CMS stores sku and webhook has matchedSku
   - Else itemName / merchandise name (normalized)
   - Else a single default stock row for that non-uniform type if the branch only tracks qty at type level

4. Only if step 2 finds **no** type for that categoryName on the branch:
   - Create type using **categoryName** (`Backpack`), never using raw itemName (`lca-backpack`) as the type title
   - Then create stock row (name can be itemName or display name; sku = matchedSku)

5. Idempotent: same fulfill / same externalReference must not double-add.

### Uniform fulfill matching (same idea)
Match type by categoryName (School Uniform / PE Uniform / LCA T-Shirt), then stock row by gender + type/piece + size (canonical Male/Female, XS–5XL, Polo≠Shirt). Never create a new type named like `male-polo-m`.

### Forbidden behavior
- Creating a new merchandise **type/category** whose name is RHET `itemName` (`lca-backpack`, `lca-id-lace`, …) when a type for `categoryName` already exists
- Using matchedSku as the new type name
- Ignoring the Backpack type that Superadmin already created via “Add Merchandise Type”

### Code to change (CMS)
- backend/services/inventory/applyMerchandiseRequestStock.js (or equivalent fulfill applier)
- inventory webhook handler that currently logs “Stock created on branch”
- Any helper that “findOrCreateMerchandise” — split into:
  - findOrCreateMerchandiseType(branch, categoryName)
  - findOrCreateStockRow(type, { itemName, sku, gender, type, size })
- Request Stock submit should persist local type_id / merchandise_id when user picked Backpack from catalog so fulfill can skip fuzzy match

### Data repair for Vista Mall Malolos (and similar)
After code fix:
1. Move qty from mistaken type `lca-backpack` into existing type `Backpack` (add 4 to Backpack stock; remove or archive empty `lca-backpack` type if safe).
2. Same for `lca-id-lace` if an Accessory/ID-lace type already existed — merge into the correct category type.
3. Do not leave duplicate types that confuse Request Stock and sales.

### Acceptance tests
1. Branch has type Backpack with qty 0. Request RHET Backpack / lca-backpack qty 4. After fulfill → Backpack qty = 4; **no** new type `lca-backpack`.
2. Second fulfill same item qty 2 → Backpack qty = 6; still one Backpack type.
3. Replay webhook → qty unchanged (idempotent).
4. Uniform: existing School Uniform type gets new/updated size row; no new type from itemName.
5. If type missing entirely, create type named **Backpack** (categoryName), stock row may use itemName.

### Out of scope
- Changing RHET webhook payload shape (categoryName + matchedSku already sent)
- Auto-creating RHET warehouse items from CMS
- Learning Kits

### Done when
Fulfill always increases the existing CMS merchandise type that matches RHET categoryName (e.g. Backpack), and never invents a sibling type named after RHET itemName like `lca-backpack`.
```
