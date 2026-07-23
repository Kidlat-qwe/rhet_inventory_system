# Shared Pages

Role-agnostic page implementations used by both admin and user wrappers under `pages/admin` and `pages/user`.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard |
| `InventoryPage.jsx` | Inventory — category summary with drill-in. Uniforms use `UniformItemModal`; **Learning Kit** uses `ItemModal` with **category-slot BOM** (concrete items filled by requester) and **computed** available kits. Shopee allocation for admins. |
| `StockRequestsPage.jsx` | Stock Requests (details modal + approve warning when out of stock) |
| `OnlineOrdersPage.jsx` | Online Orders — fulfillment tracking board (Shopee CSV/manual import, SKU mapping for visibility only, manual delivery status moves, return confirmation). Stock is no longer deducted on order import; see channel allocation below. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs |
| `StockMovementsPage.jsx` | Stock Movements |
| `ReportsPage.jsx` | Reports |
| `CategoriesPage.jsx` | Categories |

Admin-only features (API Keys, Users, Settings) live under `pages/admin/` with full implementations.
