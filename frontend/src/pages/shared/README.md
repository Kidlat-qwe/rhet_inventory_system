# Shared Pages

Role-agnostic page implementations used by both admin and user wrappers under `pages/admin` and `pages/user`.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard |
| `InventoryPage.jsx` | Inventory |
| `StockRequestsPage.jsx` | Stock Requests (details modal + approve warning when out of stock) |
| `OnlineOrdersPage.jsx` | Online Orders (Shopee CSV/manual import, SKU mapping, auto stock deduction) |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs |
| `StockMovementsPage.jsx` | Stock Movements |
| `ReportsPage.jsx` | Reports |
| `CategoriesPage.jsx` | Categories |

Admin-only features (API Keys, Users, Settings) live under `pages/admin/` with full implementations.
