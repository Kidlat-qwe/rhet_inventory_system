# CMS / PSMS — Stock request status lifecycle (Pending → Shipped → Delivered)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**RHET contract (current):**
- Create requires `branchName`
- RHET warehouse: multi-select Pending by branch → print checklist → Confirm ship deducts stock + `stock_request.shipped` (partial OK; OOS stays Pending)
- **Confirm delivery (CMS only):** `POST /api/v1/integrations/stock-requests/:id/deliver` with integration key
- Deliver emits `stock_request.delivered` + legacy `stock_request.fulfilled` (idempotent on CMS)
- RHET UI does **not** use Mark delivered as the normal path — branch confirms in CMS first

---

```markdown
## Task: Keep CMS confirm-delivery aligned with RHET /deliver

### Confirm delivery (CMS → RHET)
POST {INVENTORY_API_URL}/stock-requests/:requestId/deliver
Auth: X-Integration-Key or Bearer (PSMS key)
Body (optional):
{
  "confirmedBy": "Jane Admin",
  "branchName": "LCA Makati",
  "notes": "Branch admin confirmed physical receipt in CMS"
}

RHET behavior:
- Only from SHIPPED → DELIVERED (409 otherwise)
- If already DELIVERED → **200 idempotent** (safe CMS retry; no re-webhook / no re-deduct)
- No warehouse re-deduct
- Stores confirmedBy / notes / delivered_at
- Webhooks: stock_request.delivered (+ fulfilled alias) on first transition only
- Response 200: { success, data: { requestId, status: "DELIVERED", externalReference, ... } }

Path is **/deliver** (not /confirm-delivery). Keep CMS hardcoded path.

### Branch stock
- shipped → NO CMS stock add (goods in transit; RHET may print a paper checklist with receiver sign)
- delivered / fulfilled → add once (idempotent by externalReference)
- returned + wasDelivered true → reverse once

### Acceptance
1. Ship on RHET (batch checklist) → CMS Shipped; qty unchanged
2. Confirm received in CMS → RHET DELIVERED
3. CMS qty += once; replay does not double-add
4. Return from DELIVERED reverses; from SHIPPED does not
```
