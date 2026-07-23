# CMS — Enable Learning Kit Request Stock (paste into CMS Cursor)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Context:** CMS currently **blocks** Learning Kit in Request Stock. RHET now supports virtual kits:
- Kit BOM in RHET = **categories only** (e.g. LCA T-Shirt, Tool Kit, Workbooks)
- CMS must send `components[]` with concrete choices when requesting
- On RHET approve: deduct those component SKUs; kit “available” is recomputed
- CMS still does not create RHET warehouse items; browser never calls RHET

Keep existing uniform / non-uniform Request Stock + webhook fulfill matching (`categoryName` → merchandise type).

---

```markdown
## Task: Unblock Learning Kit on CMS Merchandise → Request Stock

### Locked product rules
1. Enable Learning Kit requests from Branch Admin Request Stock (remove the block).
2. RHET kit BOM = category slots only. CMS fills concrete items via `components[]`.
3. Do NOT pin inventory items when Superadmin creates a local “Learning Kit” type — local type name should be `Learning Kit` (RHET categoryName). The specific kit SKU/itemName is chosen at request time from RHET catalog.
4. On fulfill: add branch stock under merchandise TYPE = `Learning Kit` (not under component categories, and not under kit itemName like `nc-kg-learningkits` as a new type title — same rule as Backpack vs lca-backpack). Prefer linking/creating a stock row under Learning Kit typed by kit itemName/sku if CMS tracks multiple kits per branch.
5. Keep: backend-only RHET calls, externalReference=PSMS-<id>, webhooks, Approved By name rules, idempotent fulfill.
6. Frontend never calls RHET.

### Current CMS behavior to change
- Request Stock currently blocks Learning Kit → REMOVE that block.
- Forward payload for kits must include `components[]`.
- Persist component snapshot on local request for support/repair.
- Fulfill matcher must not invent types named after kit itemName alone as a top-level category; use categoryName `Learning Kit`.

### RHET mental model (explain in UI copy)
Example RHET kit: `nc-kg-learningkits` (SKU LEA-NC-KG-LEARNINGKITS)
Included categories (set in RHET): LCA T-Shirt | Tool Kit | Workbooks
Displayed available kits on RHET = min(category totals) — informational.

When CMS requests qty 1:
- Match kit: categoryName="Learning Kit" + itemName="nc-kg-learningkits" (exact from catalog)
- components[] must cover EVERY included category with concrete specs
- RHET approve deducts the chosen T-Shirt SKU, Tool Kit SKU, Workbook SKU (not a fake kit pile)
- Webhook fulfilled → CMS adds 1 to branch Learning Kit stock row for that kit

### Request Stock UI — Learning Kit mode

When user selects category **Learning Kit** from catalog:

1. Kit picker
   - List catalog items where categoryName === "Learning Kit"
   - Show itemName, sku, stocks (computed available), variation
   - User selects one kit (sets itemName + sku)

2. Component collector (required)
   - CMS must know which categories that kit includes.
   - Until RHET `/catalog` returns BOM, use one of:
     A) Config map keyed by kit itemName/sku → category list (coordinate with RHET admins), OR
     B) Admin-maintained “kit recipe” table in CMS mirroring RHET BOM, OR
     C) If RHET later exposes BOM on catalog/detail, prefer that live source
   - For each included category, collect:
     - Uniform-like (School Uniform, PE Uniform, LCA T-Shirt, …): gender + type + size from catalog options for that category
     - Non-uniform (Tool Kit, Workbooks, Backpack, …): pick concrete catalog item (itemName + sku) in that category
   - Allow multiple lines for the same category when needed (e.g. School Uniform Polo + Short)
   - Component quantity default = kit quantity (editable only if product requires)

3. Validate before submit
   - Every BOM category has ≥1 component line
   - No extra categories outside BOM
   - Learning Kit parent has itemName
   - Prefer availability check on kit and on each component

4. Reason + quantity as today

### Payload CMS backend must send to RHET

POST {INVENTORY_API_URL}/stock-requests
X-Integration-Key: …

{
  "requestDate": "2026-07-23",
  "requestedBy": "<branch admin name>",
  "reason": "<min 5 chars>",
  "webhookUrl": "<INVENTORY_WEBHOOK_URL>",
  "items": [
    {
      "categoryName": "Learning Kit",
      "itemName": "nc-kg-learningkits",
      "quantity": 1,
      "externalReference": "PSMS-41",
      "components": [
        {
          "categoryName": "LCA T-Shirt",
          "gender": "Unisex",
          "type": "Shirt",
          "size": "M",
          "quantity": 1
        },
        {
          "categoryName": "Tool Kit",
          "itemName": "<exact catalog itemName>",
          "sku": "<exact catalog sku>",
          "quantity": 1
        },
        {
          "categoryName": "Workbooks",
          "itemName": "<exact catalog itemName>",
          "sku": "<exact catalog sku>",
          "quantity": 1
        }
      ]
    }
  ]
}

Notes:
- itemName for the kit must match RHET exactly (often lowercase-hyphen).
- Uniform type Polo ≠ Shirt.
- Persist returned requestId, status, matchedSku, failureReason, and the components JSON on merchandiserequestlogtbl (e.g. inventory_components_json).

### Fulfill / branch stock (stock_request.fulfilled)

Keep existing fulfill pipeline, with Learning Kit specifics:

1. Find local request by PSMS-# / inventory_request_id
2. Merchandise TYPE to credit:
   - categoryName from webhook/request = `Learning Kit`
   - Match existing branch type named Learning Kit (exact / alias)
   - Do NOT create a type titled `nc-kg-learningkits`
3. Under that type, find/create stock row for this kit identity:
   - Prefer match by stored inventory_item_name / inventory_requested_sku / merchandise name for that kit
   - Add quantity (= kit quantity requested), idempotent
4. Approved By = processedBy → approvedBy → processedByName (never UUID)
5. Do NOT also auto-add component categories (T-Shirt/Tool Kit/Workbooks) to branch unless product explicitly wants that later

### Local Superadmin Create Merchandise
- Allow type category Learning Kit (from catalog) for branch display/stock after fulfill
- Still LOCAL ONLY — does not create RHET kit
- Optional: store display name; fulfill should still key off Learning Kit + kit itemName/sku

### BOM source (must implement something workable)
Because RHET catalog today may not return kit BOM:
- Add CMS config or DB table: kit_item_name/sku → [{ categoryName, kind: uniform|other }]
- Seed from RHET admin for existing kits (e.g. nc-kg-learningkits → LCA T-Shirt, Tool Kit, Workbooks)
- UI shows error “Kit recipe not configured in CMS” if missing — better than silent wrong components
- Document that when RHET exposes BOM on catalog, switch to live BOM and deprecate static map

### Files likely to touch (CMS)
- Request Stock UI (adminMerchandise / merchandise request modal)
- inventoryFieldMapping.js — build components[] for kits; stop blocking Learning Kit
- inventoryClient.js — pass components through
- applyMerchandiseRequestStock.js — Learning Kit type matching (categoryName Learning Kit + kit identity row)
- merchandiserequestlogtbl — inventory_components_json (or equivalent)
- Kit recipe config/table + admin seed docs

### Acceptance tests
1. Request Stock shows Learning Kit category and kit list from catalog.
2. Select nc-kg-learningkits → UI requires components for LCA T-Shirt, Tool Kit, Workbooks (per recipe).
3. Submit → RHET Stock Requests shows PENDING with matched kit SKU and no failureReason.
4. Missing one BOM category → RHET failureReason / CMS validation error.
5. RHET approve → webhook → branch Learning Kit stock for that kit +1; no new type named nc-kg-learningkits; component categories not spuriously created as types.
6. Replay webhook → no double stock.
7. Uniform / Backpack Request Stock paths still work as before.

### Out of scope
- Creating RHET kits from CMS
- Calling RHET from browser
- Shopee channel allocation of kits
- Changing RHET schema

### Done when
Branch Admin can request a Learning Kit from CMS with full components[], RHET can approve and deduct raw components, and CMS credits the branch Learning Kit stock row correctly (type = Learning Kit).
```
