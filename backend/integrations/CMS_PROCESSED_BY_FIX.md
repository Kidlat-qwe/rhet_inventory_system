# Paste prompt — CMS Approved By NULL / UUID on reject

Copy into Cursor in the **CMS / PSMS** project.

---

```markdown
## Task: Fix `inventory_processed_by` NULL on reject and UUID on fulfill

### Evidence from RHET Inventory logs (already correct on Inventory side)
Inventory POSTs to `https://api-cms.lca-app.com/api/webhooks/inventory` with:

```json
{
  "event": "stock_request.rejected",
  "externalReference": "PSMS-29",
  "status": "REJECTED",
  "rejectionReason": "asdasd",
  "processedBy": "Abby",
  "approvedBy": "Abby",
  "processedByName": "Abby",
  "rejectedBy": "Abby",
  "processedByUserId": "e16bb708-1396-40aa-95e0-7235e20d7f60",
  "processedAt": "2026-07-20T07:00:00.000Z"
}
```

Yet `merchandiserequestlogtbl.inventory_processed_by` is **NULL** for PSMS-28/29.
=> CMS webhook handler is **not saving** name fields on `stock_request.rejected`.

PSMS-27 stored a UUID because CMS previously saved `processedByUserId` (or `processed_by`) into `inventory_processed_by`.

### Required CMS fix (`POST /api/webhooks/inventory`)

```javascript
function looksLikeUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function pickApproverName(body) {
  const candidates = [
    body.processedBy,
    body.approvedBy,
    body.processedByName,
    body.rejectedBy, // reject alias from Inventory
  ]
  for (const raw of candidates) {
    const value = String(raw || '').trim()
    if (!value || looksLikeUuid(value)) continue
    return value
  }
  return null
}

// Handle BOTH events the same way for inventory_processed_by:
if (body.event === 'stock_request.fulfilled' || body.event === 'stock_request.rejected') {
  const approverName = pickApproverName(body)
  await updateMerchandiseRequestLog({
    externalReference: body.externalReference,
    inventory_status: body.status,
    inventory_processed_by: approverName, // NEVER body.processedByUserId
    inventory_rejection_reason: body.rejectionReason || null,
    inventory_matched_sku: body.matchedSku || null,
    inventory_synced_at: new Date(),
  })
}
```

### Do NOT
- Save `body.processedByUserId` into `inventory_processed_by`
- Only update Approved By on `stock_request.fulfilled` — **reject must update too**
- Ignore `processedBy` because status is REJECTED
- Use `stock_request.created` for approver (always null)

### Backfill broken rows
```sql
-- UUID rows (wrong)
UPDATE merchandiserequestlogtbl
SET inventory_processed_by = NULL
WHERE inventory_processed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Then re-send webhook from Inventory or manually set name after CMS fix
```

### Acceptance
1. Reject PSMS-31 in Inventory → CMS DB `inventory_processed_by` = `Abby` (not NULL)
2. Approve PSMS-32 → `inventory_processed_by` = admin name (not UUID)
3. UI Approved By column matches DB
```
