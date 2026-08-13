# CMS / PSMS — Send `batchReference` for multi-item Request Stock

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Why:** RHET Inventory now groups stock-request **lines** under one cart for Manage + invoicing. Without a shared `batchReference`, each CMS line looks like a separate request.

**RHET already:** persists `batchReference`, groups Manage, invoices only shipped lines at internal selling price.

---

```markdown
## Task: Send one `batchReference` per CMS Request Stock submit (multi-item cart)

### Goal
When a branch admin submits **one Request Stock** with multiple items/categories, RHET must treat them as **one request group** (one Manage screen, one or more shipment invoices).

Keep unique per-line `externalReference`. Add a **shared cart id** as top-level `batchReference`.

### Do not break
- Browser never calls RHET; CMS backend uses X-Integration-Key
- `branchName`, `requestedBy`, `reason`, `webhookUrl` unchanged
- Per-line `externalReference = PSMS-<local_line_id>` (still unique)
- Webhooks stay **per line** (`shipped` / `delivered` / `returned` / `rejected`)
- Confirm delivery still `POST /stock-requests/:requestId/deliver` per line

### What to send

```json
{
  "requestedBy": "Jane Admin",
  "branchName": "LCA Makati",
  "reason": "Campus restock",
  "batchReference": "PSMS-REQ-82",
  "webhookUrl": "https://api-cms.lca-app.com/api/webhooks/inventory",
  "items": [
    {
      "categoryName": "Shirt",
      "gender": "Unisex",
      "type": "Logo 1",
      "size": "M",
      "quantity": 2,
      "externalReference": "PSMS-82-1"
    },
    {
      "categoryName": "Backpack",
      "itemName": "school-backpack",
      "quantity": 1,
      "externalReference": "PSMS-82-2"
    }
  ]
}
```

| Field | Required | Value |
|---|---|---|
| `batchReference` | **Yes for multi-item carts** | One id for the whole CMS submit (e.g. local request header id: `PSMS-REQ-82`). Same string on that POST. |
| `items[].externalReference` | Yes | Unique **line** id (`PSMS-82-1`, `PSMS-82-2`, …) |

If CMS currently creates one local row per item and calls RHET once per row:
- Prefer **one POST** with all `items[]` + one `batchReference`, **or**
- Keep multiple POSTs but send the **same** `batchReference` on every call for that cart.

### Do not
- Use a new `batchReference` for every line of the same cart
- Put `batchReference` only inside `items[]` (RHET expects it top-level)
- Change webhook/deliver to a group endpoint (still per `requestId`)

### Acceptance
1. One CMS submit with Shirt + Backpack → RHET Stock Requests shows **one group**, Manage lists both lines
2. Each line still has its own `externalReference` / webhook
3. Omitting `batchReference` on a multi-call cart still splits into separate RHET groups (bug to avoid)

### Out of scope
- CMS printing RHET invoices (RHET warehouse prints after Manage)
- Changing RHET schema
```
