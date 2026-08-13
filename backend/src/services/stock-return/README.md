# CMS branch stock returns

Inbound **Return Stock** from CMS / PSMS.

`POST /api/v1/integrations/stock-returns` (X-Integration-Key)

- Payload mirrors `/stock-requests` plus `requestType: "RETURN"` and `PSMS-RET-*` references.
- Matches inventory the same way as Request Stock (uniform: gender/type/size; other: itemName/sku).
- On success: insert `stock_requests` with `request_kind = RETURN`, `status = PENDING` (no warehouse movement yet).
- All-or-nothing match. Unmatched / kit items → 422 and CMS rolls back branch qty.
- Idempotent on `(source_system, external_reference)`.
- Webhook on ingest: `stock_return.received` (`status: PENDING`, `requestKind: RETURN`). After staff inspect: `stock_return.accepted` (`status: RETURNED`, `returnReusable` always boolean).
- Never emit `stock_request.*` for `PSMS-RET-*` / `request_kind = RETURN`.
- Reusable inspect: `RETURN` movement + qty added to warehouse, then status `RETURNED`. Not reusable: status `RETURNED` only.

Service: `../stock-return.service.js`.
