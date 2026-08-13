# Backend services

Business logic modules used by Express controllers and routes.

| File | Purpose |
|------|---------|
| `settings.service.js` | Org settings singleton (`system_settings`): branding, timezone, default low-stock threshold, courier presets, uniform/shirt sizes, Help Assistant flag. |
| `inventory.service.js` | Categories, inventory CRUD, movements, Tool Kit children |
| `dashboard.service.js` | Dashboard summary and reorder alerts |
| `users.service.js` | User list / create / role / status |
| `manual-order.service.js` | HQ / Scoring courier shipments + partner ingest webhooks |
| `manual-order-fulfillment.js` | Status transitions (Shipping Management–aligned) |
| `webhook.service.js` | Outbound partner webhooks (stock requests + manual orders) |
| `online-order.service.js` | Marketplace orders |
| `stock-request.service.js` | External stock requests (line rows + `batch_reference` group) |
| `stock-request-invoice.service.js` | Shipment invoices at internal selling price (preview + issue/ship snapshot) |
| `channel-allocation.service.js` | Shopee channel stock |
| `integration-client.service.js` | API keys / partners |
| `webhook.service.js` | Outbound partner webhooks |
| `inventory-resolver.service.js` | SKU / catalog matching |
| `stock-rules.js` | Shared stock math helpers |
