# Learning Kit — Virtual (computed) stock

**Status:** Adopted product direction (2026-07-23)  
**CMS:** Learning Kits remain **not** integrated in the Merchandise UI yet; when requested via API, CMS/partner must send `components[]`.

## Decision

Learning Kits are a **recipe (BOM)**, not a separately stocked warehouse pile.

| Rule | Behavior |
|---|---|
| BOM in RHET admin | **Category slots only** (Backpack, School Uniform, ID Lace, …) |
| Concrete inventory item | Filled by the **external stock request** (`components[]`: gender/type/size or itemName/sku) — same as previous request flow |
| Available kits (display) | `min(total ACTIVE stocks per included category)` |
| Kit `stocks` column | Kept in sync with that computed value; **not** manually edited |
| Kit outflow (approve) | Deduct the **request-resolved** component SKUs; then recompute kit availability |
| Channel allocate on kits | Requires concrete components; category-slot kits should not be allocated to Shopee without resolved lines |

## Example

Kit **NC→KG** includes categories: Backpack, School Uniform, ID Lace.

| Category totals | Stock |
|---|---|
| Backpack | 11 |
| School Uniform | 13 |
| ID Lace | 15 |

Displayed available kits = **11**.

CMS requests 1 kit and specifies e.g. Backpack SKU + Male Polo M + ID lace SKU.  
On approve: those three SKUs −1 each → category totals drop → available kits **10**.

## Why this hybrid

- Keeps requester choice of size/SKU (previous CMS-friendly contract).
- Still avoids a fake manually stocked kit pile.
- Displayed kit qty reflects how many complete kits category stock could theoretically support.

## Note on category totals

“School Uniform 13” is the **sum of all active uniform SKUs** in that category. A request for a scarce size can still fail at approve even if the category total looks high.
