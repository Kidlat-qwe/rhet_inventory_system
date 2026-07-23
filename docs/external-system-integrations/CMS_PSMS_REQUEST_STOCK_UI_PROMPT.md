# CMS Merchandise — Request Stock UI (match RHET Inventory concept)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Why this exists:** RHET Stock Requests showed failures like:
- Category `LCA Bag` was not found
- Variation / Item name / Matched SKU empty
- Approve blocked until category + attributes match a stocked RHET item

CMS Merchandise “Request Stock” must stop using local-only merchandise labels and instead follow the **same concept as RHET Inventory**: pick a **RHET category**, then pick / specify the **exact variant** RHET stocks.

**Still locked from the prior pass:** Learning Kits blocked; frontend never calls RHET; backend proxies catalog.

---

```markdown
## Task: Redesign CMS Merchandise “Request Stock” to match RHET Inventory concept

### Problem (real failure)
A CMS request arrived in RHET as:
- Category: "LCA Bag"  ← NOT a RHET category name
- Variation / Item name / Matched SKU: empty
- Failure: Category "LCA Bag" was not found
- External reference: PSMS-32

RHET cannot approve until the request matches a real inventory row.

### Mental model (same as RHET Inventory page)

RHET Inventory works like this:
1. Categories first (School Uniform, PE Uniform, LCA T-Shirt, Backpack, Book, …)
2. Drill into a category to see stocked **items / variants**
3. Uniforms are variants of gender + type + size (e.g. Male · Polo · S)
4. Non-uniforms are specific itemName / SKU rows (e.g. school-backpack)

CMS Request Stock must mirror that:
1. User picks a **RHET category** (from live catalog — not CMS-invented names like "LCA Bag")
2. Form switches by category kind:
   - Uniform-like → Gender + Type + Size (+ quantity + reason)
   - Non-uniform → pick a concrete **item from catalog** (itemName / sku) (+ quantity + reason)
3. CMS backend maps those exact values to RHET POST /stock-requests
4. Optional: call availability before submit; block submit if no match

Do **not** send free-text local merchandise category names to RHET.

### Do not redesign the overall integration flow
Keep:
- Frontend → CMS API only (never call RHET from browser)
- Save merchandiserequestlogtbl → forward RHET
- externalReference = PSMS-<local_id>
- Webhooks, Approved By, idempotent fulfill
- Learning Kit **blocked / hidden** this pass

### Data source of truth for the form
CMS backend already (or must) proxy:
  GET {INVENTORY_API_URL}/catalog
  GET {INVENTORY_API_URL}/availability?...

Request Stock UI must load categories + items from that catalog (via CMS proxy).

Typical catalog shape:
{
  "categories": [
    { "categoryId": "uuid", "categoryName": "School Uniform" },
    { "categoryId": "uuid", "categoryName": "Backpack" }
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

Use **exact** `categoryName`, `itemName`, `sku`, and for uniforms the gender/type/size values that exist on catalog items (parse `variation` as "Gender · Type · Size" when needed).

### Uniform-like vs non-uniform (same rules as RHET)

Uniform-like category names (case-insensitive):
- School Uniform
- PE Uniform
- LCA T-Shirt / LCA Shirt
- any name ending with " uniform"

For these, RHET matches:
  categoryName + gender + type + size

Allowed values (exact):
- gender: Male, Female, Unisex (School Uniform usually Male/Female only)
- type: Polo, Short, Blouse, Skirt, Shirt, Pants
- size: XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL

CRITICAL: Polo ≠ Shirt.

Non-uniform (everything else that is not Learning Kit):
RHET matches:
  categoryName + itemName and/or sku

Example: categoryName "Backpack" + itemName "school-backpack"
NOT categoryName "LCA Bag" with empty itemName.

Learning Kit: keep blocked/hidden.

### Request Stock UI requirements

#### Stepper / fields (recommended UX)
1. Category — dropdown from catalog.categories only
2. If uniform-like:
   - Gender dropdown (options derived from catalog items in that category)
   - Type dropdown (filtered by category + gender; Polo/Short/Blouse/…)
   - Size dropdown (from catalog variants for that gender+type)
3. If non-uniform:
   - Item dropdown listing catalog.items filtered by selected category
     Show: itemName, sku, stocks, variation
   - Selecting an item sets itemName + sku for the payload
4. Quantity (positive int)
5. Reason (min 5 chars)
6. Submit → existing CMS create merchandise-request API

#### Validation before submit
- Category required and must exist in catalog
- Uniform: gender + type + size required
- Non-uniform: itemName or sku required (prefer both from selected catalog item)
- Reject Learning Kit
- Prefer calling availability; if available=false or 404 match, show error and do not submit
- Never invent category names (ban hard-coded "LCA Bag", "LCA Uniform", etc. unless they exactly equal a RHET categoryName)

#### Mapping CMS local merchandise (optional bridge)
If CMS still has local merchandisestbl rows for branch stock after fulfill:
- On submit, store both:
  - RHET identity (categoryName, gender/type/size OR itemName/sku)
  - Optional local merchandise id for fulfill apply
- On fulfill webhook, add stock to the local row linked at request time
- Do not use local merchandise **name** as RHET categoryName

### Payload examples (CMS → RHET via backend)

Uniform:
{
  "categoryName": "School Uniform",
  "gender": "Male",
  "type": "Polo",
  "size": "S",
  "quantity": 1,
  "externalReference": "PSMS-32"
}

Non-uniform bag/backpack:
{
  "categoryName": "Backpack",
  "itemName": "school-backpack",
  "sku": "BAG-SCHOOL-BACKPACK",
  "quantity": 1,
  "externalReference": "PSMS-32"
}

Wrong (what caused the screenshot failure) — do not send:
{
  "categoryName": "LCA Bag",
  "quantity": 1,
  "externalReference": "PSMS-32"
}

### Backend / mapping updates
- inventoryFieldMapping.js: stop mapping CMS labels like "LCA Bag" → invent RHET categories.
  Prefer pass-through of catalog-selected RHET categoryName / itemName / sku / gender / type / size.
- If a legacy CMS label map remains, it must map TO an exact RHET catalog categoryName that exists (e.g. local "LCA Bag" → RHET "Backpack") AND still require a concrete itemName/sku.
- Persist failureReason from RHET on the local request so My Requests shows why match failed.
- Keep webhook / Approved By / idempotent fulfill unchanged.

### Files likely to touch
- frontend admin Merchandise Request Stock modal/form (adminMerchandise.jsx and related components)
- any merchandise request field helpers / validators
- backend services/inventory/inventoryFieldMapping.js
- backend merchandise-requests create path
- catalog/availability proxy usage from the form

### Out of scope
- Learning Kit components UI
- Calling RHET from the browser
- Changing RHET schema
- Shopee / channel allocation

### Acceptance tests
1. Open Request Stock → categories list equals RHET catalog (no "LCA Bag" unless RHET literally has that category).
2. Pick School Uniform → Male → Polo → S → submit → RHET shows matched SKU and Pending (not "category not found").
3. Pick a non-uniform category → select a catalog item → submit → matchedSku/itemName populated in RHET.
4. Attempt Learning Kit → blocked.
5. Attempt submit without item/attrs → client validation error.
6. Approve in RHET → CMS branch stock increases once; Approved By = name.
7. Replay of old broken "LCA Bag" style payload is rejected by CMS validation going forward.

### Done when
CMS Request Stock feels like RHET Inventory: category → concrete variant → request, and RHET Stock Requests no longer get unmatched categories like "LCA Bag" with empty item fields.
```
