# CMS / PSMS — Align with RHET quantity adjustment (paste into CMS Cursor)

**How to use:** Paste **everything inside the fenced block** below into the **CMS / PSMS** Cursor chat.

**Why CMS must update:** RHET Inventory now lets warehouse staff **reduce** a pending stock-request line quantity before ship (e.g. CMS requested 5, warehouse has 3 → RHET sets 3 with required remarks). CMS is **not** notified unless you handle the new webhook. Without this, CMS still shows qty 5, may block or confuse branch admins, and could **over-credit** branch stock on deliver.

**RHET does not change:** CMS still submits requests via `POST /stock-requests`. Browser never calls RHET. Quantity editing is **RHET UI only**.

---

```markdown
## Task: Align CMS with RHET stock-request quantity adjustment

### Problem
CMS forwards stock requests to RHET. When warehouse stock is lower than requested, RHET staff now **adjust quantity down** in Stock Requests → Manage (inline Qty edit + required remarks) instead of rejecting the line.

CMS must:
1. Receive and store the adjustment
2. Show branch admins the **approved ship qty** vs original request
3. Credit branch stock using the **adjusted** qty on deliver (not the original CMS submit)

### Do not break
- POST /api/sms/merchandise-requests/batch → RHET POST /stock-requests
- externalReference = PSMS-<local_id>, batchReference = PSMS-REQ-<first_id>
- branchName on every stock request
- Pending → Shipped → Delivered lifecycle (credit branch on delivered/fulfilled only)
- Return Stock: PENDING 201 is success; stock_return.received / stock_return.accepted
- Frontend never calls RHET directly

---

### NEW webhook: stock_request.quantity_adjusted

RHET POSTs to POST /api/webhooks/inventory when staff saves a quantity reduction on a **PENDING** line.

Auth: X-Integration-Key or Bearer (same as other inventory webhooks)

Example payload:

{
  "event": "stock_request.quantity_adjusted",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "externalReference": "PSMS-42",
  "batchReference": "PSMS-REQ-15",
  "sourceSystem": "PSMS",
  "status": "PENDING",
  "quantity": 3,
  "originalQuantity": 5,
  "quantityAdjustmentRemarks": "Only 3 units available in warehouse",
  "quantityAdjustedAt": "2026-08-28T02:40:00.000Z",
  "adjustedBy": "Abby",
  "processedBy": "Abby",
  "processedByName": "Abby",
  "requestedBy": "Paul Camus",
  "branchName": "Little Champions Academy Inc. – Vista Mall Pampanga",
  "reason": "only a few stocks are left",
  "categoryName": "PE Uniform",
  "gender": "Male",
  "type": "Pants",
  "size": "XL",
  "matchedSku": "PEU-M-PANTS-XL",
  "inventoryId": "uuid",
  "timestamp": "2026-08-28T02:40:00.000Z"
}

Field meanings:
| Field | CMS action |
|-------|------------|
| quantity | **New** approved ship qty — use this everywhere after adjustment |
| originalQuantity | CMS-requested qty (first time only; do not overwrite if already set) |
| quantityAdjustmentRemarks | Required RHET note — show to branch admin |
| adjustedBy / processedByName | Display name (never UUID) |
| status | Stays PENDING until shipped |

---

### CMS webhook handler changes (inventoryWebhooks.js or equivalent)

Add case for event === "stock_request.quantity_adjusted":

1. Find local row in merchandiserequestlogtbl:
   - Primary: inventory_external_reference / externalReference === PSMS-<id>
   - Fallback: inventory_request_id === requestId

2. Update columns (add if missing):
   - quantity / requested_qty → payload.quantity (3)
   - inventory_original_quantity → payload.originalQuantity (5) — set only if null
   - inventory_adjustment_remarks → payload.quantityAdjustmentRemarks
   - inventory_adjusted_by → payload.adjustedBy
   - inventory_adjusted_at → payload.quantityAdjustedAt or timestamp
   - inventory_status stays PENDING (or your local Pending)

3. **Do NOT** change merchandisestbl branch stock on this event.

4. Respond HTTP 200 quickly.

5. Idempotency: if quantity + remarks already match stored values, no-op (still 200).

---

### Branch Admin UI (adminMerchandise / My Requests)

For each line with inventory_original_quantity set and quantity < original:

- Show: **Requested {original} · Approved for ship {quantity}**
- Subtext or tooltip: quantityAdjustmentRemarks
- Optional badge: "Qty adjusted by warehouse"

If no adjustment: show quantity only as today.

Do NOT let branch admin edit qty in CMS — read-only from RHET.

---

### Deliver / fulfill — CRITICAL

On stock_request.shipped:
- Mark local Shipped
- **No** branch stock add

On stock_request.delivered OR stock_request.fulfilled:
- Credit merchandisestbl using **quantity from webhook** (already adjusted if RHET changed it)
- Idempotent by externalReference

On applyMerchandiseRequestStock.js (or equivalent):
- Use the **current** stored quantity on the request log row (post-adjustment), not the value from the original CMS form submit snapshot alone.

Example: CMS submitted 5 → RHET adjusted to 3 → shipped/delivered webhooks send quantity: 3 → branch += 3.

---

### Reject path unchanged

stock_request.rejected → local Rejected, no stock add, show rejectionReason.

Adjustment does not replace reject — staff may still reject if item cannot be fulfilled at all.

---

### Optional: poll repair

If webhook missed, CMS repair can call RHET GET /integrations/stock-requests/:requestId (integration key) and sync quantity + originalQuantity fields. Prefer webhook as primary.

---

### DB migration (CMS) — suggested columns on merchandiserequestlogtbl

| Column | Type | Notes |
|--------|------|-------|
| inventory_original_quantity | INT NULL | CMS request before RHET adjustment |
| inventory_adjustment_remarks | VARCHAR(500) NULL | RHET staff note |
| inventory_adjusted_by | VARCHAR(150) NULL | Display name |
| inventory_adjusted_at | TIMESTAMPTZ NULL | |

If you already store quantity in one column, update that column on adjustment — do not keep two competing qty fields without clear naming.

---

### Files likely to touch (CMS)

- backend/routes/inventoryWebhooks.js — handle stock_request.quantity_adjusted
- backend/services/inventory/applyMerchandiseRequestStock.js — credit using adjusted qty
- frontend adminMerchandise.jsx (or request log list) — show Requested vs Approved for ship
- DB migration for new columns (if needed)

---

### Acceptance tests

1. CMS requests PE Pants qty 5 → RHET PENDING.
2. RHET staff adjusts to 3 with remarks → CMS webhook → local row qty=3, original=5, remarks stored, status still Pending.
3. Branch My Requests shows "Requested 5 · Approved for ship 3" + remarks.
4. RHET ships → CMS Shipped, branch stock unchanged.
5. Branch confirms delivery → CMS += **3** (not 5).
6. Replay quantity_adjusted webhook → no double update.
7. Reject path still works.
8. Lines without adjustment behave exactly as before.

---

### Out of scope (CMS)

- CMS editing request quantity (RHET-only)
- Increasing qty above CMS request (RHET API blocks)
- Changing RHET schema or calling PATCH /stock-requests/:id/quantity from CMS

### Done when

Branch admin sees RHET-adjusted quantities before delivery, and branch stock increases by the **adjusted** amount after confirm received — never the pre-adjustment CMS submit qty when RHET reduced the line.
```
