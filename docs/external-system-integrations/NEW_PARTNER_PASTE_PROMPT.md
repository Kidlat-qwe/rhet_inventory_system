# Paste prompt — connect a NEW external system to RHET Inventory

Copy everything inside the fenced block below into Cursor (or hand to another engineering team) when wiring a **new** partner system.

**Not for CMS/PSMS** (already live). For CMS work, use the `CMS_PSMS_*` docs in this folder.

**Human-readable guides (share alongside this prompt):**

- [NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md)
- [API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md)
- [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)

---

````markdown
## Task: Connect this external system to RHET Inventory

### Goal
When a user submits a stock / merchandise request in **our** system:
1. Save locally (recommended)
2. Call RHET Inventory from **our backend** so the request appears as PENDING under RHET → Stock Requests
3. When RHET approves or rejects, receive a webhook and update our local request + branch/local stock

### RHET Inventory (production)
- UI: https://inventory.lca-app.com
- Integration API base: https://api-inventory.lca-app.com/api/v1/integrations
- Auth: header `X-Integration-Key: <key>` (also accepts `Authorization: Bearer <key>`)
- Key source: RHET Admin → Management → API Keys → Generate (plaintext shown once)
- Each partner gets its own key and `systemCode` (e.g. HR, VENDOR). Do not reuse the CMS/PSMS key.

### Our backend env (Coolify / secrets — never VITE_* / NEXT_PUBLIC_*)
```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=<paste from RHET API Keys modal>
INVENTORY_WEBHOOK_URL=https://<OUR-API-DOMAIN>/api/webhooks/inventory
```

Also accept `INVENTORY_API_KEY` as an alias for `INVENTORY_INTEGRATION_KEY`.

Local RHET API (if testing against a local inventory server):
`INVENTORY_API_URL=http://localhost:3000/api/v1/integrations`

### API endpoints (all require X-Integration-Key)
| Method | Path | Purpose |
|---|---|---|
| GET | /catalog | Categories + items (drive all dropdowns from this) |
| GET | /availability | Optional pre-check stock by attributes |
| POST | /stock-requests | Create one or many request lines |
| GET | /stock-requests/:id | Optional poll if webhooks are delayed |

Response envelope: `{ "success": true, "data": … }`  
Errors: `{ "success": false, "error": { "code", "message", "details" } }`

### Catalog rules
- Prefer live `GET /catalog` — do not hard-code category / size lists.
- Categories may include `categoryKind`:
  - `SCHOOL_UNIFORM` | `PE_UNIFORM` | `LCA_SHIRT` → send gender + type + size
  - `LEARNING_KIT` → send itemName + `components[]`
  - `OTHER` → send itemName and/or sku
- Always send the exact `categoryName` from catalog (names are unique; kinds can repeat).

### POST /stock-requests body
```json
{
  "requestDate": "YYYY-MM-DD",
  "requestedBy": "Name",
  "reason": "Reason text (min 5 chars)",
  "webhookUrl": "<INVENTORY_WEBHOOK_URL>",
  "batchReference": "optional",
  "items": [
    {
      "categoryName": "School Uniform",
      "gender": "Male",
      "type": "Polo",
      "size": "S",
      "quantity": 2,
      "externalReference": "<SYSTEM_CODE>-<local-request-id>"
    }
  ]
}
```

Non-uniform item example fields: `categoryName`, `itemName`, `sku` (optional), `quantity`, `externalReference`.

Learning Kit example (required when category is Learning Kit / kind LEARNING_KIT):
```json
{
  "categoryName": "Learning Kit",
  "itemName": "grade-1-learning-kit",
  "quantity": 2,
  "externalReference": "<SYSTEM_CODE>-KIT-1001",
  "components": [
    { "categoryName": "LCA T-Shirt", "gender": "Unisex", "type": "Shirt", "size": "M", "quantity": 2 },
    { "categoryName": "School Uniform", "gender": "Male", "type": "Polo", "size": "S", "quantity": 2 },
    { "categoryName": "Backpack", "itemName": "school-backpack", "quantity": 2 }
  ]
}
```
`components[]` must cover every category on the kit BOM. Uniform components need gender/type/size; others need itemName/sku.

### Field mapping (exact match required)
RHET matches uniforms by categoryName + gender + type + size.
Variation display format: `Male · Polo · S`

| Our UI label | Send to RHET |
|---|---|
| Men / Male | Male |
| Women / Female | Female |
| Unisex | Unisex (not for School Uniform in RHET UI) |
| Polo | Polo |
| Shirt | Shirt (NOT the same as Polo) |
| Extra Small … 5XL | XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL |

Pull allowed values from `/catalog` items / variation parsing when possible.

### Implement in our backend
1. `inventoryClient` (or equivalent): `getCatalog()`, `checkAvailability()`, `submitStockRequests()`, `getStockRequest(id)`
2. On local request CREATE → always `POST` RHET `/stock-requests` (do not silently skip)
3. Store `rhet_request_id` + `external_reference` on the local row
4. Persist Learning Kit `components` snapshot locally (webhook is request-level)
5. `POST /api/webhooks/inventory` (or our chosen path) handling:
   - `stock_request.created`
   - `stock_request.fulfilled` → mark approved + **increase local/branch stock** per our rules
   - `stock_request.rejected` → mark rejected; show reason
6. Match webhook to local row by `externalReference` or `requestId`
7. Store `processedBy` / `approvedBy` as **display name** (never UUID). UUID is `processedByUserId` if needed
8. On RHET API failure → mark sync FAILED (or roll back) and show the error
9. Update `.env.example` with the three inventory vars (placeholders only)

### Webhook payload (fulfilled example)
```json
{
  "event": "stock_request.fulfilled",
  "requestId": "uuid",
  "externalReference": "HR-19",
  "sourceSystem": "HR",
  "status": "FULFILLED",
  "matchedSku": "SCH-M-POLO-S",
  "quantity": 2,
  "processedBy": "Abby",
  "approvedBy": "Abby",
  "processedByName": "Abby",
  "processedByUserId": "uuid",
  "processedAt": "2026-07-23T08:00:00.000Z",
  "timestamp": "2026-07-23T08:00:00.000Z"
}
```
Respond HTTP 200 quickly. RHET does not update our DB — only our webhook/polling code does.

### Acceptance tests
1. `GET /catalog` with key → 200
2. Submit from our UI → row appears in RHET Stock Requests (Pending)
3. RHET details show Matched SKU (not unmatched / failureReason)
4. RHET approve → warehouse stock down; our webhook fires; local stock up
5. Reject path updates our status; warehouse unchanged
6. Reusing the same `externalReference` does not create a silent duplicate
7. If Learning Kits are in scope: kit with full `components[]` approves and deducts components

### Do NOT
- Call RHET from the browser or put the key in frontend env
- Reuse the CMS/PSMS integration key
- Approve only in our system and assume RHET stock changed
- Map Polo/Top always to "Shirt"
- Hard-code category lists instead of `/catalog`
- Submit Learning Kits without `components` for every BOM category
- Rely on RHET’s legacy `PSMS_WEBHOOK_URL` fallback — always send our `webhookUrl`
````

---

After paste implementation, verify against [NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md) §9 test plan before production.
