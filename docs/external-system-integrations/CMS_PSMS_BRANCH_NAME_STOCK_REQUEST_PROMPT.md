# CMS / PSMS — Required `branchName` on stock requests

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Why this exists:** RHET Inventory now shows a **Branch** column on Stock Requests so warehouse staff know which campus requested stock.  
`POST /api/v1/integrations/stock-requests` **requires** top-level `branchName` (display name). Requests without it are rejected with validation error `400`.

**Deploy order:** RHET already enforces this. Update CMS **before** (or immediately after) RHET goes live with this change, or Request Stock submits will fail.

---

```markdown
## Task: Send required `branchName` on every RHET stock request

### Problem
RHET now requires:

```json
{
  "requestedBy": "<person name>",
  "branchName": "<branch / campus display name>",
  "reason": "...",
  "items": [ ... ]
}
```

If `branchName` is missing or shorter than 2 characters, RHET returns **400** and does **not** create the stock request.

### What to send
| Field | Required | Value |
|---|---|---|
| `branchName` | **Yes** | Branch / campus **display name** staff already see in CMS (e.g. `"LCA Makati"`, `"LCA Cebu"`). **Not** an internal numeric/UUID id. |
| `requestedBy` | Yes | Person who submitted (unchanged) |

Top-level on the RHET body (same level as `requestedBy` / `reason`), **not** inside each `items[]` row.

### Where to change (CMS)
1. Find the backend builder that calls RHET:
   `POST {INVENTORY_API_URL}/stock-requests`
   (usually after saving local `merchandiserequestlogtbl` / merchandise request).
2. When the user is on a branch context (Merchandise → pick branch → Request Stock), read that branch’s **display name**.
3. Add to the RHET payload:
   `branchName: <selectedBranchDisplayName>`
4. Validate locally before calling RHET: block submit if branch name is empty.
5. Keep `externalReference = PSMS-<localId>`, `webhookUrl`, item matching rules unchanged.

### Example (uniform)

```json
{
  "requestDate": "2026-07-31",
  "requestedBy": "Jane Admin",
  "branchName": "LCA Makati",
  "reason": "Restock PE Logo 1 shirts for campus display",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "Shirt",
      "gender": "Unisex",
      "type": "Logo 1",
      "size": "M",
      "quantity": 2,
      "externalReference": "PSMS-41"
    }
  ]
}
```

### Example (non-uniform)

```json
{
  "requestedBy": "Jane Admin",
  "branchName": "LCA Makati",
  "reason": "Restock backpacks",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "Backpack",
      "itemName": "school-backpack",
      "quantity": 1,
      "externalReference": "PSMS-42"
    }
  ]
}
```

### Webhooks (optional awareness)
RHET fulfill/reject webhooks may also include `branchName` for convenience. CMS does **not** need to change webhook handlers for this field unless you want to store/display it locally.

### Do not
- Send branch UUID / internal id as `branchName`
- Put `branchName` only inside `items[]` (RHET expects it top-level)
- Invent a different field name (`branch`, `campusName`, `branchId`)

### Acceptance checklist
1. Request Stock from branch **LCA Makati** → RHET creates request with `branchName: "LCA Makati"`
2. RHET Stock Requests table shows **Branch** = LCA Makati
3. Omitting `branchName` in a test call → RHET 400; CMS shows a clear error
4. Existing fulfill/reject / Approved By flow still works

### Out of scope
- Learning Kit policy (keep current CMS rules)
- Changing RHET catalog / matching logic
```
