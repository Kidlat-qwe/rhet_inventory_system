# CMS branch stock returns

Inbound **Return Stock** from CMS / PSMS.

`POST /api/v1/integrations/stock-returns` (X-Integration-Key)

- Payload mirrors `/stock-requests` plus `requestType: "RETURN"` and `PSMS-RET-*` references.
- Matches inventory the same way as Request Stock (uniform: gender/type/size; other: itemName/sku).
- On success: insert `stock_requests` with `request_kind = RETURN`, `status = RETURNED`, and create a `RETURN` warehouse movement (stock up).
- All-or-nothing. Unmatched / kit items → 422 and CMS rolls back branch qty.
- Idempotent on `(source_system, external_reference)`.
- Webhook: `stock_return.accepted` only (never `stock_request.*`).

Service: `../stock-return.service.js`.
