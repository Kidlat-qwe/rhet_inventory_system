# CMS / PSMS — Return Stock vs RHET HQ inspection

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Why:** RHET no longer restocks warehouse when CMS posts Return Stock. HQ inspects first (Pending → Returned reusable / not reusable). If CMS still requires `status: RETURNED` on the POST response, it will treat success as failure and **roll back branch qty**.

**RHET already:** `POST /api/v1/integrations/stock-returns` → `requestKind: RETURN`, `status: PENDING`; staff inspect then `RETURNED` + optional warehouse `RETURN` movement.

---

```markdown
## Task: Align CMS Return Stock with RHET HQ inspection (do not rollback on PENDING)

### Goal
Keep CMS Return Stock submit as-is (deduct branch qty, POST `/stock-returns`, PSMS-RET-* refs). Update success + webhook handling so CMS does **not** expect warehouse restock or `status: RETURNED` on the create call.

### Do not break
- Button still beside Request Stock; Branch Admin only
- One POST per cart: `POST {INVENTORY_API_URL}/stock-returns` with X-Integration-Key
- `requestType: "RETURN"`, `batchReference: PSMS-RET-<first_local_id>`, per-line `externalReference: PSMS-RET-<local_id>`
- `branchName` = campus display name
- Uniform: categoryName + gender + type + size. Non-uniform: categoryName + itemName + sku
- If RHET HTTP fails (4xx/5xx / network): restore deducted branch qty and delete local log rows
- Never treat `stock_request.*` webhooks as Return Stock rows (`PSMS-RET-*` only)

### RHET create response (changed)
HTTP **201** (new) or **200** (idempotent replay) is **success**.

Each line may look like:

```json
{
  "requestId": "uuid",
  "status": "PENDING",
  "requestKind": "RETURN",
  "externalReference": "PSMS-RET-82",
  "batchReference": "PSMS-RET-82",
  "matchedSku": "SHIRT-U-L1-M"
}
```

| Rule | Detail |
|---|---|
| Success | HTTP 201/200. **Do not** require `status === "RETURNED"` |
| `PENDING` | HQ has the return; inspection not done yet. **Keep** branch deduction |
| Replay 200 | Same PSMS-RET-* already stored. Not a second deduct. Not a rollback |
| Failure only | Non-2xx, or 422 unmatched/kit. Then restore branch qty |

### Local log / UI
- Local row status can stay **Returned** (goods already left the branch)
- `inventory_status` (RHET sync):
  - after successful POST → `RECEIVED` or `PENDING` (awaiting HQ check)
  - webhook `stock_return.received` → same (idempotent)
  - webhook `stock_return.accepted` → `RETURNED`
- Optional My Requests copy: “Awaiting HQ inspection” until accepted; then show Reusable / Not reusable from `returnReusable`
- Do **not** put `[STOCK_RETURN]` in the reason shown to the user (unwrap if you still store that prefix)

### Webhooks (RHET → CMS)
Match on `externalReference` starting with `PSMS-RET-` (or `requestKind: RETURN`). Ignore `stock_request.*`.

| Event | When | CMS action |
|---|---|---|
| `stock_return.received` | Create accepted into RHET Pending (`status: PENDING`, `requestKind: RETURN`) | Keep row in **My Requests → Pending**. Branch qty stays deducted. No `returnReusable` on this event. |
| `stock_return.accepted` | HQ inspected (`status: RETURNED`, `returnReusable` always true/false) | Move row to **My Requests → Returned**. Show Reusable / Not reusable. **Do not** add branch qty back |

`returnReusable`:
- `true` = RHET added qty back to **warehouse**
- `false` = damaged / not reusable; warehouse unchanged
- **Never** use this to re-credit CMS branch stock (already deducted on submit)

Example accepted payload fields: `event`, `externalReference`, `batchReference`, `status` (`RETURNED`), `returnReusable`, `returnNotes`, `quantity`, `matchedSku`, `processedBy`, `timestamp`.

### Do not
- Rollback branch qty because RHET `status` is `PENDING`
- Wait for `stock_return.accepted` before treating POST 201 as success
- Re-add branch stock when `returnReusable` is false (or true)
- Match Return Stock rows with `stock_request.shipped` / `delivered` / `returned` / `fulfilled`
- Change the RHET URL (still `/stock-returns`, not `/stock-requests`)

### Acceptance
1. Submit Return Stock → CMS qty down; RHET Pending “Awaiting return check”; no warehouse increase yet
2. CMS does **not** restore branch qty
3. HQ marks reusable → RHET warehouse up + Returned / Reusable; CMS inventory_status RETURNED; branch qty still down
4. HQ marks not reusable → RHET warehouse unchanged + Returned / Not reusable; CMS inventory_status RETURNED; branch qty still down
5. Replay same PSMS-RET-* → 200, no second deduct, no rollback

### Out of scope
- CMS deciding reusable / not reusable (HQ / RHET only)
- Learning Kit / Tool Kit returns (RHET 422; return concrete items)
- Printing RHET invoices
```
