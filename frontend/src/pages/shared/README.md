# Shared Pages

Shared list pages keep table column headers visible when there is no data; the empty message renders inside the table body.

| File | Route label |
|------|-------------|
| `DashboardPage.jsx` | Dashboard — overview cards (merchandise / stocks / alerts); **Sales this month** by channel (Stock requests · Online · Manual: ₱ + units); charts: on-hand inventory value, stocks by category; **Monthly consumption** beside **Recent stock movements**; full-width **Reorder point**. |
| `InventoryPage.jsx` | Inventory — category summary → category items. Uniform categories: filter by **Gender / Type / Size** (includes Set). **Child-SKU categories** (e.g. Tool Kit): click parent name opens raw-items page. Supports `initialCategoryId` from Categories “Open Inventory”. |
| `StockRequestsPage.jsx` | Stock Requests — rows are **CMS cart groups** (`batchReference`), not single lines. **Manage** shows all items + internal selling price + **branch received** date/time (`deliveredAt` / confirmed by). Check lines for **this shipment** (unchecked ready lines stay Pending). After picked & verified → **invoice preview** → print commercial **INVOICE** → **Confirm ship & save invoice**. Later shipments get INV-2+. Checklist print still available. Deliver via CMS. **CMS Return Stock** (`requestKind = RETURN`) lands on **Pending** for inspection (**Reusable** restocks warehouse + RETURN movement; **Not reusable** does not), then moves to **Returned** with Reusable / Not reusable categories. |
| `OnlineOrdersPage.jsx` | Online Orders — Shopee-style tabs: **All**, **Unpaid**, **To Ship**, **Shipping**, **Completed**, **Return/Refund/Cancel**. Internal codes: PROCESSING / READY_TO_SHIP / SHIPPED / DELIVERED / RETURNED+CANCELLED. **Shipping** deducts mapped RHET stock. Admin and **user** staff can import **CSV/XLSX**, map items, and advance fulfillment. |
| `ManualOrdersPage.jsx` | Manual Orders — Scoring Shipping Management–aligned tabs: **ALL**, **Pending**, **Processing**, **Shipped**, **Delivered**, **Error**, **Ineligible**, **Needs attention**. No Ready-to-ship. Columns: Transaction ID, Payment Date, Student, Parent, Program, Courier, Status, Update Status. **Shipped deducts** as `MANUAL_SALE`. Map items before ship for Scoring header-only pushes. Admin + user `canManage`. |
| `ReleaseLogsPage.jsx` | Merchandise releasing logs — tabs: **Stock requests** (SHIPPED / DELIVERED / RETURNED) and **Online orders** (ONLINE_SALE / MANUAL_SALE / cancel / return movements). |
| `StockMovementsPage.jsx` | Warehouse stock movements only (excludes online-order movement types). |
| `CategoriesPage.jsx` | Categories — **Users and admins can add**. Create flow: Uniform (+ subtype), Learning Kit, Others (+ child SKUs toggle). After create, offer **Open Inventory**. **Admin only**: edit/delete (delete requires typing the category name; items removed when safe). |

Admin-only features (API Keys, Users, **Settings**) live under `pages/admin/` with full implementations.
