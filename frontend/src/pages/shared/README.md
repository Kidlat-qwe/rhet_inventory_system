# Shared Pages

Role-agnostic page implementations used by both admin and user wrappers under `pages/admin` and `pages/user`.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard — summary cards + charts: inventory value, stocks by category, monthly consumption (line), reorder (horizontal stock vs threshold + shortfall) |
| `InventoryPage.jsx` | Inventory — category summary with drill-in. Uniforms / Learning Kit BOM. Optional **Remarks** column (truncated with …; full text on hover). Admin can **Delete item** (type exact item name to confirm). |
| `StockRequestsPage.jsx` | Stock Requests — Branch column; tabs Pending / Shipped / Delivered / Returned / Rejected. Ship deducts; Deliver notifies CMS; Return restocks. |
| `OnlineOrdersPage.jsx` | Online Orders — fulfillment board (includes **Cancelled**). Admin and **user** staff can import **CSV/XLSX**, map items, and advance fulfillment. **Shipped deducts** mapped RHET stock. |
| `ManualOrdersPage.jsx` | Manual Orders — HQ direct ship with RHET courier. Create from inventory lines; fulfillment board; **Shipped deducts** as `MANUAL_SALE`. Admin + user `canManage`. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs — tabs: **Stock requests** (SHIPPED / DELIVERED / RETURNED) and **Online orders** (ONLINE_SALE / MANUAL_SALE / cancel / return movements). |
| `StockMovementsPage.jsx` | Warehouse stock movements only (excludes online-order movement types). |
| `CategoriesPage.jsx` | Categories — Admin (`canManage`) can add/edit/delete. Delete requires typing the exact category name and is blocked while items exist. No category delete on Inventory. |

Admin-only features (API Keys, Users) live under `pages/admin/` with full implementations.
