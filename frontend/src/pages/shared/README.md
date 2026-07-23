# Shared Pages

Role-agnostic page implementations used by both admin and user wrappers under `pages/admin` and `pages/user`.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard |
| `InventoryPage.jsx` | Inventory — category summary (Category, Total stocks, Total Shopee, Status rollup, Last updated) with a "View raw stocks" drill-in per category. Adding an item inside a uniform category creates the type pair (Polo+Short / Shirt+Pants) via `UniformItemModal`; **Learning Kit** and other categories use `ItemModal` (kits include editable BOM component rows). Includes the "Shopee" allocation column/action for admins. |
| `StockRequestsPage.jsx` | Stock Requests (details modal + approve warning when out of stock) |
| `OnlineOrdersPage.jsx` | Online Orders — fulfillment tracking board (Shopee CSV/manual import, SKU mapping for visibility only, manual delivery status moves, return confirmation). Stock is no longer deducted on order import; see channel allocation below. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs |
| `StockMovementsPage.jsx` | Stock Movements |
| `ReportsPage.jsx` | Reports |
| `CategoriesPage.jsx` | Categories |

Admin-only features (API Keys, Users, Settings) live under `pages/admin/` with full implementations.
