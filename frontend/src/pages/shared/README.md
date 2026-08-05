# Shared Pages

Shared list pages keep table column headers visible when there is no data; the empty message renders inside the table body.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard — summary cards + charts: inventory value, stocks by category; **Monthly consumption** beside **Recent stock movements**; full-width **Reorder point** (search / filter / sort / paginate). |
| `InventoryPage.jsx` | Inventory — category summary → category items. Uniform categories: filter by **Gender / Type / Size** (includes Set). **Child-SKU categories** (e.g. Tool Kit): click parent name opens raw-items page. Supports `initialCategoryId` from Categories “Open Inventory”. |
| `StockRequestsPage.jsx` | Stock Requests — **Branch** column header is a filter dropdown (All branches default; options from existing request branches). Status tab counts respect the selected branch. **Multi-select Pending** (one branch); **Ship selected** with printable dispatch checklist (org name/timezone from Settings; item name + SKU + kit components; sign boxes: warehouse, **courier/pickup paper sign**, designated receiver), mandatory “picked & verified”, **partial ship** (OOS stays Pending). Deliver via CMS; Return restocks. |
| `OnlineOrdersPage.jsx` | Online Orders — Shopee-style tabs: **All**, **Unpaid**, **To Ship**, **Shipping**, **Completed**, **Return/Refund/Cancel**. Internal codes: PROCESSING / READY_TO_SHIP / SHIPPED / DELIVERED / RETURNED+CANCELLED. **Shipping** deducts mapped RHET stock. Admin and **user** staff can import **CSV/XLSX**, map items, and advance fulfillment. |
| `ManualOrdersPage.jsx` | Manual Orders — HQ direct ship with RHET courier. Create modal: courier dropdown from **Settings** presets (+ **Others** / custom name); Category + Item + Qty on one row. **Shipped deducts** as `MANUAL_SALE`. Admin + user `canManage`. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs — tabs: **Stock requests** (SHIPPED / DELIVERED / RETURNED) and **Online orders** (ONLINE_SALE / MANUAL_SALE / cancel / return movements). |
| `StockMovementsPage.jsx` | Warehouse stock movements only (excludes online-order movement types). |
| `CategoriesPage.jsx` | Categories — Admin can add/edit/delete. Create flow: Uniform (+ subtype), Learning Kit, Others (+ child SKUs toggle). After create, offer **Open Inventory**. Admin delete requires typing the category name; items in the category are removed when safe. |

Admin-only features (API Keys, Users, **Settings**) live under `pages/admin/` with full implementations.
