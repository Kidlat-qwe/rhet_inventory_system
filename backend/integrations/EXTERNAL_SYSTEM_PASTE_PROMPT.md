# Paste prompt — connect external system to RHET Inventory

Copy everything below into Cursor (or send to another dev team) when wiring a **new** external system.

---

```markdown
## Task: Connect this external system to RHET Inventory

### Goal
When a user submits a stock/merchandise request in our system:
1. Save locally (optional)
2. Call RHET Inventory API so the request appears as PENDING in RHET → Stock Requests
3. When RHET approves, receive webhook and update our local request + increase branch stock

### RHET Inventory (production)
- UI: https://inventory.lca-app.com
- API base: https://api-inventory.lca-app.com/api/v1/integrations
- Auth: X-Integration-Key header (per-system key from RHET → API Keys)

### Our backend env (already set or add to Coolify)
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=<paste from RHET API Keys modal>
INVENTORY_WEBHOOK_URL=https://<OUR-API-DOMAIN>/api/webhooks/inventory

Also support INVENTORY_API_KEY as alias for INVENTORY_INTEGRATION_KEY.
Never put these in frontend VITE_* / NEXT_PUBLIC_* vars.

### API endpoints (all require X-Integration-Key)
GET  /catalog
GET  /availability?categoryName=...&gender=...&type=...&size=...
POST /stock-requests
GET  /stock-requests/:id

### POST /stock-requests body
{
  "requestDate": "YYYY-MM-DD",
  "requestedBy": "Name",
  "reason": "Reason text",
  "webhookUrl": "<INVENTORY_WEBHOOK_URL>",
  "items": [{
    "categoryName": "School Uniform",
    "gender": "Male",
    "type": "Polo",
    "size": "S",
    "quantity": 2,
    "externalReference": "<SYSTEM_CODE>-<local-request-id>"
  }]
}

### Field mapping (exact match required)
RHET matches uniforms by categoryName + gender + type + size.
Variation format: "Male · Polo · S"

| Our UI        | Send to RHET |
|---------------|--------------|
| Men           | Male         |
| Women         | Female       |
| Polo          | Polo         |
| Shirt         | Shirt        |
| Top           | map correctly — Polo is NOT Shirt |
| Extra Small   | XS           |
| Small/Medium/Large | S / M / L |

Call GET /catalog and align dropdowns with RHET categories/variations.

### Implement in our backend
1. services/inventoryClient.js — getCatalog(), submitStockRequests(), getStockRequest()
2. On local request CREATE → POST RHET /stock-requests (do not silently skip)
3. Store inventory_request_id + externalReference on local row
4. POST /api/webhooks/inventory — handle stock_request.fulfilled and stock_request.rejected
5. On fulfilled → mark local Approved + INCREASE branch merchandise quantity
6. On RHET failure → mark sync FAILED or roll back; show error to user
7. Update .env.example

### Webhook payload example
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "PSMS-19",
  "status": "FULFILLED",
  "matchedSku": "SCH-M-POLO-S",
  "quantity": 2,
  "processedBy": "Juan Dela Cruz",
  "processedAt": "2026-07-17T08:00:00.000Z"
}

Match webhook to local row by externalReference or inventory_request_id.
Store processedBy into inventory_processed_by / Approved By (display name of RHET admin).

### Acceptance test
1. GET /catalog with key → success
2. Submit from our UI → appears in RHET Stock Requests (Pending)
3. RHET details show Matched SKU (not "no match")
4. RHET approve → warehouse stock down; our webhook → branch stock up
5. Reject path updates our status

### Do NOT
- Call RHET from browser
- Hardcode PSMS-only — use configurable SYSTEM_CODE for externalReference prefix
- Map Polo/Top always to "Shirt"
```

---

Full reference: RHET repo `backend/integrations/EXTERNAL_SYSTEM_INTEGRATION.md`
