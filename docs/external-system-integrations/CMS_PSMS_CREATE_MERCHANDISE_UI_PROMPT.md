# CMS Superadmin — Create Merchandise UI (align fields with RHET Inventory)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Goal:** When Superadmin creates branch merchandise (`merchandisestbl`), the **fields and allowed values** match RHET Inventory so Request Stock / fulfill matching stay aligned.

**Important:** Creating merchandise in CMS still creates **local branch stock only**. It does **not** auto-create a row in RHET. Field alignment is so CMS identity (category / gender / type / size / item name) can match RHET catalog identity later.

---

```markdown
## Task: Align CMS Superadmin “Create Merchandise” fields with RHET Inventory

### Context — current CMS flow (keep structure, fix field model)
1. Superadmin → Merchandise → pick branch
2. See merchandise types for that branch (today: LCA Uniform, LCA PE Uniform, LCA Bag, …)
3. Add Merchandise / Create
4. Choose Uniform (sizing) vs Other item
5. Fill name, branch, qty, price, image, remarks
6. If uniform: Size, Gender, Piece/Type
7. Save → local merchandisestbl row for that branch
8. More stock for same type → View Stocks → add another row (different size/gender/piece)

This remains a **CMS-local** create. Do not call RHET on Save.
Do not auto-sync new CMS items into RHET warehouse.

### Why change
RHET Inventory identity uses exact labels:
- Categories: School Uniform, PE Uniform, LCA T-Shirt, Backpack, Book, … (not "LCA Bag", not "LCA Uniform")
- Gender: Male / Female / Unisex (not Men / Women)
- Size: XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL (not Extra Small / Small / …)
- Type/piece: Polo, Short, Blouse, Skirt, Shirt, Pants (Polo ≠ Shirt)

If CMS stores Men + Extra Large + local type "LCA Bag", Request Stock and fulfill matching break (same class of bug as category "LCA Bag" not found).

### Mental model (same as RHET Inventory create item)

RHET create item concept:
1. Pick / belong to a **category**
2. If uniform-like category → Gender + Type + Size define the variant (separate stock row per combo)
3. If non-uniform → Item name (+ optional variation/SKU); one stock row per item
4. Uniform sets: School Uniform often creates paired types for same gender+size
   - Male: Polo + Short
   - Female: Blouse + Skirt
   - PE Uniform: Shirt + Pants
   - LCA T-Shirt: Shirt (Unisex typical)

CMS Create Merchandise should feel the same for **attributes**, even though stock stays per-branch in CMS.

### Locked decisions
1. Creating merchandise = local CMS only (no RHET POST on create).
2. Learning Kit create in CMS: either block or treat as plain "Other item" for now (no kit BOM UI). Prefer block/hide Learning Kit type unless product asks otherwise.
3. Prefer RHET-canonical labels in DB going forward; migrate or map legacy labels on read/write.
4. Request Stock / webhook flows already being aligned separately — this task is Superadmin create/edit merchandise forms + stored attribute values.

---

### Category / merchandise-type alignment

Replace or map CMS merchandise types to RHET category names.

| Old CMS type (examples) | RHET-aligned categoryName to store/show |
|---|---|
| LCA Uniform / School Uniform | School Uniform |
| LCA PE Uniform / PE Uniform | PE Uniform |
| LCA T-Shirt / LCA Shirt | LCA T-Shirt |
| LCA Bag / Bag | Backpack (or exact RHET catalog name if different) |
| Book | Book |
| Accessory / Keychain | Accessory (or exact RHET name) |
| Learning Kit | Learning Kit (blocked/deferred unless required) |

UI for branch merchandise types should display these RHET names (or show friendly label but **persist** `categoryName` / type code equal to RHET).

Optional: load RHET `GET /catalog` categories (via CMS backend proxy) to drive the type list so new RHET categories appear without hardcoding. If offline/fallback, use the table above.

---

### Form modes (mirror RHET)

#### A) Uniform-like categories
When category is School Uniform, PE Uniform, or LCA T-Shirt (or name ends with " uniform"):

Required fields:
- Category (aligned name)
- Gender: Male | Female | Unisex
  - School Uniform: Male / Female only (no Unisex), same as RHET
  - PE Uniform / LCA T-Shirt: may include Unisex
- Type / Piece (exact):
  - School Uniform + Male → Polo, Short
  - School Uniform + Female → Blouse, Skirt
  - PE Uniform → Shirt, Pants
  - LCA T-Shirt → Shirt
- Size: XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL
- Quantity, Price
- Optional: image, remarks
- Merchandise name: can auto-build like RHET (e.g. "school-uniform-polo") or free text, but attributes above are the matching keys

Recommended UX (closer to RHET UniformItemModal):
- User picks Gender + Size once
- Show paired type lines (Polo+Short or Blouse+Skirt or Shirt+Pants) with qty/price each
- Saving creates **one CMS stock row per type line** (same as today: separate rows by size+gender+piece)

Do NOT use:
- Men / Women labels as stored values (map UI→Male/Female if you keep friendly labels)
- Extra Small / Small / Medium / Large / Extra Large as stored values (map→XS/S/M/L/XL)
- Collapsing Polo into Shirt

#### B) Other / non-uniform categories
When category is Backpack, Book, Accessory, etc.:

Required fields:
- Category (aligned name)
- Merchandise / item name (required) — prefer lowercase-hyphen style if you want closeness to RHET itemName, or keep display name + store a normalized `item_name` / `sku` field for matching
- Quantity, Price
- Optional: variation/remarks, image, SKU

Do NOT require gender/type/size for these.
Do NOT invent fake uniform fields for bags.

---

### Value mapping table (must implement)

Gender:
| CMS UI (optional display) | Store / send |
|---|---|
| Men / Male | Male |
| Women / Female | Female |
| Unisex | Unisex |

Size:
| CMS UI (optional display) | Store |
|---|---|
| Extra Small | XS |
| Small | S |
| Medium | M |
| Large | L |
| Extra Large | XL |
| 2XL … 5XL | 2XL … 5XL |

Type:
| CMS UI | Store |
|---|---|
| Polo | Polo |
| Short | Short |
| Blouse | Blouse |
| Skirt | Skirt |
| Shirt | Shirt |
| Pants | Pants |

Persist canonical values in merchandisestbl (or adjacent columns). Friendly labels only in UI.

---

### Suggested DB / model fields (align conceptually)

Ensure each merchandise stock row can express RHET identity:

| Concept | Suggested CMS fields |
|---|---|
| Category | category_name or merchandise_type keyed to RHET name |
| Item name | merchandise_name / item_name |
| SKU (optional but useful) | sku — can mirror RHET later or stay local |
| Gender | gender = Male/Female/Unisex or null |
| Type/piece | piece_type / item_type = Polo/Short/… or null |
| Size | size_label = XS/S/… or null |
| Qty / price | existing |
| Branch | existing |

Unique-ish business key for uniforms per branch:
  branch + category + gender + type + size
  (same idea as RHET unique uniform variant)

Non-uniform:
  branch + category + item_name (and/or sku)

---

### Migration / backward compatibility
- Existing rows with Men/Women and Extra Small/… must still display.
- On edit/save, rewrite to canonical Male/Female and XS/S/….
- One-time data migration script recommended for merchandisestbl + merchandise type names (LCA Uniform → School Uniform, LCA Bag → Backpack, etc.).
- Request Stock mapping should prefer stored canonical fields; keep legacy map only as fallback.

---

### Explicitly out of scope
- Auto-creating RHET inventory when CMS adds merchandise
- Calling RHET from the create-merchandise form
- Learning Kit BOM / components UI
- Changing RHET schema
- Shopee / channel allocation

### Relationship to Request Stock
After this alignment:
- Create Merchandise stores the same identity language as RHET
- Request Stock can pick RHET catalog variants that match those attributes
- Fulfill webhook can add qty to the correct branch row by category+gender+type+size or category+itemName

---

### Files likely to touch (CMS)
- Superadmin Merchandise pages / Add Merchandise modal
- Uniform vs Other form components
- Merchandise type / category seed or admin config
- Validators for create/update merchandise
- Optional migration script for legacy gender/size/type/category labels
- Any helpers shared with Request Stock field mapping

### Acceptance tests
1. Create School Uniform · Male · Polo · M → stored gender=Male, type=Polo, size=M, category=School Uniform.
2. Create PE Uniform · Female · Shirt · S → Shirt stays Shirt (not Polo).
3. Create Backpack with name only → no gender/type/size required; category=Backpack (not LCA Bag).
4. UI may show "Small" but DB has "S".
5. Legacy "Men / Extra Large" row still opens; saving converts to Male / XL.
6. Request Stock for that uniform variant matches RHET when RHET has the same attributes.
7. Creating merchandise does not call RHET API.

### Done when
Superadmin Create Merchandise uses the same category + uniform attribute vocabulary as RHET Inventory, while remaining a local branch-stock create.
```
