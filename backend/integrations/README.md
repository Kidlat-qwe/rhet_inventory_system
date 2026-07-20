# External System Integrations

Machine-to-machine API for any external app to request stock from RHET Inventory.

## Documentation

| Document | Use when |
|---|---|
| **[EXTERNAL_SYSTEM_INTEGRATION.md](./EXTERNAL_SYSTEM_INTEGRATION.md)** | Full reference (URLs, API, matching, webhooks, troubleshooting) |
| **[EXTERNAL_SYSTEM_PASTE_PROMPT.md](./EXTERNAL_SYSTEM_PASTE_PROMPT.md)** | Copy-paste into Cursor / another repo to implement integration |
| **[PSMS_API_INTEGRATION.md](./PSMS_API_INTEGRATION.md)** | PSMS/CMS-specific notes and field mapping |
| **[SHOPEE_ONLINE_ORDERS.md](./SHOPEE_ONLINE_ORDERS.md)** | Shopee online orders (CSV/manual now, live API later) |
| **[CMS_PROCESSED_BY_FIX.md](./CMS_PROCESSED_BY_FIX.md)** | CMS still shows "RHET Inventory" in Approved By — map `processedBy` |

## Quick start

### 1. RHET Inventory (admin)

1. **API Keys** → Generate API key (system name e.g. `PSMS`, `HR`)
2. Copy modal → `.env` for external backend
3. Optional RHET backend fallback: `PSMS_WEBHOOK_URL=https://external-api.../api/webhooks/inventory`

### 2. External system (backend)

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_<system>_<secret>
INVENTORY_WEBHOOK_URL=https://your-api-domain.com/api/webhooks/inventory
```

### 3. Test

```bash
curl https://api-inventory.lca-app.com/api/v1/integrations/catalog \
  -H "X-Integration-Key: YOUR_KEY"
```

## Auth

```http
X-Integration-Key: rhet_<system>_<secret>
```

Keys are generated in RHET → **API Keys** (hashed in DB). Legacy shared `PSMS_INTEGRATION_KEY` for **incoming** auth is not used.

## Workflow

1. External backend → `POST /stock-requests` → RHET **Pending**
2. RHET user → **Stock Requests** → Review → Approve
3. RHET warehouse stock **decreases**
4. Webhook → external system → local/branch stock **increases** (your code)

## API summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog` | Categories + items |
| GET | `/availability` | Stock check |
| POST | `/stock-requests` | Submit request |
| GET | `/stock-requests/:id` | Poll status (`processedBy` = approver display name) |

Base URL: `https://api-inventory.lca-app.com/api/v1/integrations` (production)

## Webhook `processedBy`

On `stock_request.fulfilled` / `stock_request.rejected`, payload includes:

```json
"processedBy": "Abby",
"approvedBy": "Abby",
"processedByName": "Abby",
"processedByUserId": "e16bb708-1396-40aa-95e0-7235e20d7f60"
```

`processedBy` (and aliases) are always a **display name**, never a UUID. Use `processedByUserId` if you need the user id.
