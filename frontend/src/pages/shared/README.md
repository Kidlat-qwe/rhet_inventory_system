# Shared Pages

Role-agnostic page implementations used by both admin and user wrappers under `pages/admin` and `pages/user`.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard |
| `InventoryPage.jsx` | Inventory — category summary with drill-in. Uniforms / Learning Kit BOM. Optional **Remarks** column (truncated with …; full text on hover). Admin can **Delete item** (type exact item name to confirm). |
| `StockRequestsPage.jsx` | Stock Requests — **Branch** column (CMS campus display name), details modal, approve warning when out of stock |
| `OnlineOrdersPage.jsx` | Online Orders — fulfillment board (includes **Cancelled**). Admin and **user** staff can import **CSV/XLSX**, map items, and advance fulfillment. **Shipped deducts** mapped RHET stock. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs — tabs: **Stock requests** (FULFILLED PSMS/CMS) and **Online orders** (ONLINE_SALE / cancel / return movements). |
| `StockMovementsPage.jsx` | Warehouse stock movements only (excludes online-order movement types). |
| `CategoriesPage.jsx` | Categories — Admin (`canManage`) can add/edit/delete. Delete requires typing the exact category name and is blocked while items exist. No category delete on Inventory. |

Admin-only features (API Keys, Users) live under `pages/admin/` with full implementations.
