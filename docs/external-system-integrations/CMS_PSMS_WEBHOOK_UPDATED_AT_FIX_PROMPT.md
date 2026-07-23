# CMS — Fix inventory webhook (`updated_at` / stuck Pending after RHET fulfill)

**How to use:** Paste **everything inside the fenced block** into the **CMS / PSMS** Cursor chat.

**Evidence from RHET (PSMS-33):**
- RHET status: `FULFILLED` (warehouse approve already committed)
- Webhook POST to `https://api-cms.lca-app.com/api/webhooks/inventory` returned **500**
- Error body: `{"success":false,"message":"column \"updated_at\" does not exist"}`
- RHET `webhook_last_status`: `FAILED`
- CMS Merchandise request stayed **Pending / Awaiting RHET**

So the bug is on **CMS webhook apply**, not on RHET approve.

---

```markdown
## Task: Fix CMS inventory webhook so RHET FULFILLED updates local request + branch stock

### Incident
RHET approved stock request externalReference **PSMS-33**.
RHET POSTed:
  POST https://api-cms.lca-app.com/api/webhooks/inventory
  event: stock_request.fulfilled
  status: FULFILLED

CMS responded HTTP 500:
  column "updated_at" does not exist

Result:
- RHET = FULFILLED (stock already deducted centrally)
- CMS = still Pending / Awaiting RHET
- Branch merchandisestbl was NOT increased

### Goal
1. Fix the SQL / schema so webhook handler never references a missing `updated_at` column.
2. Make fulfill/reject webhook processing resilient and idempotent.
3. Repair PSMS-33 (and any other stuck FULFILLED requests) without double-adding stock.
4. Add a quick regression test or checklist so this cannot recur silently.

### Likely code locations (CMS)
- backend/routes/inventoryWebhooks.js
- backend/services/inventory/applyMerchandiseRequestStock.js
- any UPDATE on merchandiserequestlogtbl / merchandise request tables
- sync-inventory repair: POST /api/sms/merchandise-requests/:id/sync-inventory
- repair script: backend/scripts/repairInventoryFulfillment.js (if present)

### Root cause to fix
Somewhere in the fulfill path an UPDATE/INSERT uses `updated_at` on a table that does not have that column.

Do one of:
A) Add the column via migration if the product wants it, e.g.
   ALTER TABLE merchandiserequestlogtbl ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
   (and set it on updates)
OR
B) Remove/replace `updated_at` in the webhook SQL with the real timestamp column this table already uses
   (e.g. `date_updated`, `modified_at`, `updatedAt`, or omit if none exists).

Inspect the actual table DDL first — do not guess the column name.

Also check related tables touched on fulfill (merchandisestbl, notification tables, etc.) for the same bad column reference.

### Required webhook behavior (keep / restore)

On `stock_request.fulfilled`:
1. Find local row by externalReference (PSMS-#) OR inventory_request_id
2. If already Approved/Fulfilled for this inventory event → return 200 idempotently (do not double-add stock)
3. Else:
   - Add requested quantity to branch merchandisestbl (match by stored RHET identity / local merchandise link)
   - Mark local request Approved
   - Set inventory_status = FULFILLED
   - Set inventory_processed_by from processedBy → approvedBy → processedByName (never UUID)
   - Set inventory_synced_at = now (or existing sync column)
4. Return HTTP 200 JSON success quickly

On `stock_request.rejected`:
1. Find local row
2. Mark Rejected; save rejectionReason; save processedBy name
3. Do NOT add stock
4. Return 200

On `stock_request.created`:
- Optional sync fields only; do NOT write Approved By

Auth: accept X-Integration-Key / Bearer if currently required; do not break existing RHET sender.

### Repair PSMS-33 after code fix
1. Deploy/fix CMS webhook handler + migration if any.
2. Either:
   - Call CMS sync-inventory for the local request id linked to PSMS-33
   OR
   - Ask RHET to resend:
     node scripts/resend-processed-by-webhook.mjs PSMS-33 --send
3. Verify:
   - CMS My Requests / Stock Requests shows Approved (not Pending)
   - Approved By = Abby (or RHET admin name)
   - Branch stock increased exactly once
   - Replaying webhook again does not double stock

### Search for other stuck rows
Find local merchandise requests where:
- inventory_request_id / inventory_external_reference is set
- inventory_status is still PENDING (or local status Pending)
- but RHET already FULFILLED
Repair those with the same sync path after the fix.

### Acceptance tests
1. Unit/integration: fulfill webhook with valid payload → 200, status Approved, stock +qty once.
2. Replay same fulfill webhook → 200, stock unchanged (idempotent).
3. Reject webhook → Rejected, no stock add.
4. Intentionally broken column reference must not exist (grep SQL for updated_at vs real schema).
5. End-to-end: new Request Stock → RHET approve → CMS auto-updates without manual sync.

### Out of scope
- Changing RHET approve / stock deduction logic
- Learning Kits
- Creating RHET inventory from CMS merchandise create

### Done when
CMS webhook returns 200 on stock_request.fulfilled, PSMS-33 (and similar) leave Pending, branch stock updates once, and RHET resend no longer gets 500 `updated_at` errors.
```
