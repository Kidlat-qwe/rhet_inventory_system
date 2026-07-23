# PSMS / CMS ↔ RHET Inventory Integration

PSMS-specific notes. For the generic guide see [EXTERNAL_SYSTEM_INTEGRATION.md](./EXTERNAL_SYSTEM_INTEGRATION.md).  
**Paste into PSMS project:** [EXTERNAL_SYSTEM_PASTE_PROMPT.md](./EXTERNAL_SYSTEM_PASTE_PROMPT.md)

---

## Production URLs

| System | URL |
|---|---|
| PSMS UI | `https://cms.lca-app.com` |
| PSMS API | `https://api-cms.lca-app.com` |
| RHET Inventory UI | `https://inventory.lca-app.com` |
| RHET Inventory API | `https://api-inventory.lca-app.com/api/v1/integrations` |

---

## PSMS backend `.env`

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_psms_<from-rhet-api-keys-modal>
INVENTORY_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
```

Optional on **RHET** backend (webhook fallback):

```env
PSMS_WEBHOOK_URL=https://api-cms.lca-app.com/api/webhooks/inventory
```

---

## PSMS field mapping (important)

CMS merchandise form → RHET payload:

| CMS field | RHET field | Example |
|---|---|---|
| LCA Uniform / PE Uniform | `categoryName` | `School Uniform`, `PE Uniform` |
| Men / Women / Unisex | `gender` | `Male`, `Female`, `Unisex` |
| Polo / Shirt / Pants / Short | `type` | **`Polo` must stay `Polo`** — not `Shirt` |
| Extra Small … 3XL | `size` | `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL` |
| Local request id | `externalReference` | `PSMS-<request_id>` |

### Known bug pattern

CMS sends `type: "Shirt"` when user picks **Polo** → RHET shows `Male · Shirt · S` → no match for `Male · Polo · S`.

**Fix:** Map merchandise type from catalog or explicit rules; call `GET /catalog` for valid variations.

---

## Required PSMS backend work

| Route / code | Purpose |
|---|---|
| `services/inventoryClient.js` | Call RHET API |
| `POST /api/v1/merchandise-requests` (modify) | After local save → `POST` RHET `/stock-requests` |
| `POST /api/webhooks/inventory` | Receive fulfilled/rejected |
| Webhook handler | On fulfilled → increase `merchandisestbl` quantity for branch |

Saving only to `merchandiserequestlogtbl` without calling RHET leaves RHET Stock Requests empty.

---

## Webhook → increase branch stock

When RHET sends `stock_request.fulfilled` or `stock_request.rejected`:

1. Find row by `externalReference` (e.g. `PSMS-19`)
2. Set local status → Approved/Fulfilled or Rejected
3. Store **`processedBy`** (admin display name) into `inventory_processed_by` / Approved By column
4. On fulfilled → match branch merchandise by name + size + gender + type and **add** `quantity` to local branch stock

RHET warehouse stock is already deducted on approve — PSMS branch stock is separate.

Webhook includes:

```json
{
  "event": "stock_request.fulfilled",
  "externalReference": "PSMS-19",
  "status": "FULFILLED",
  "processedBy": "Abby",
  "approvedBy": "Abby",
  "processedByName": "Abby",
  "processedByUserId": "e16bb708-1396-40aa-95e0-7235e20d7f60",
  "processedAt": "2026-07-17T08:00:00.000Z",
  "quantity": 2
}
```

`processedBy` is always a display name (never a UUID).

---

## Test flow

1. `curl` catalog with PSMS key ✅
2. Submit merchandise request from CMS UI
3. Verify RHET **Stock Requests** → Pending, Matched SKU visible
4. Approve in RHET → RHET inventory down
5. PSMS webhook → branch stock up, request status updated

---

## Paste prompt for PSMS repo

Add to top of [EXTERNAL_SYSTEM_PASTE_PROMPT.md](./EXTERNAL_SYSTEM_PASTE_PROMPT.md):

```markdown
## PSMS-specific
- Modify: backend/routes/merchandiserequests.js (POST create)
- Add: backend/routes/webhooks/inventory.js + server.js mount
- systemCode / externalReference prefix: PSMS
- Map Polo → type "Polo", not "Shirt"
- webhookUrl: https://api-cms.lca-app.com/api/webhooks/inventory
```
