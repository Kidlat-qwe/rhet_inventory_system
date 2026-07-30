# Shared UI Components

Reusable presentational and modal components used across admin and user pages.

| File | Purpose |
|------|---------|
| `Icon.jsx` | SVG icon set |
| `EmptyState.jsx` | Empty list / no-data placeholder |
| `PageLoading.jsx` | Full-page loading indicator |
| `StatusBadge.jsx` | Status pill with color class |
| `MovementTable.jsx` | Stock movement history table (optional order/notes column for online logs) |
| `Sidebar.jsx` | App navigation sidebar |
| `Header.jsx` | Top bar with breadcrumbs, stock-request notifications (count badge, toast alert, **Mark all as Read**), account menu (**Forgot password** / **Log out**) |
| `CategoryModal.jsx` | Create / edit category. **Type** (behavior) can be reused; **name** must stay unique. Stores `categoryKind`. |
| `DeleteCategoryModal.jsx` | Admin-only delete confirm: must type the exact category name before Delete is enabled. Categories with items cannot be deleted (Inventory has no category delete). |
| `DeleteInventoryModal.jsx` | Admin-only delete confirm for an inventory item: must type the exact item name. Shows SKU; completed stock requests are unlinked; blocked for online orders / active requests / kit BOM. |
| `ItemModal.jsx` | Create / edit a single inventory item. For **Shirt** (`LCA_SHIRT`), shows Gender / **Logo** / Size. Non-uniform (**Others**, etc.): editing the item name regenerates the SKU. Uniform SKUs stay locked. |
| `UniformItemModal.jsx` | Add / edit a uniform set. School Uniform: Male/Female. **PE Uniform: Unisex only** (Shirt + Pants). LCA T-Shirt uses `ItemModal` (logo field) instead of this set modal. |
| `HelpAssistant.jsx` | Floating help button (bottom-right). Cleared from pagination via content/pager padding. Rule-based FAQ; toggle via `ENABLE_HELP_ASSISTANT` in `App.jsx`. |
| `ActionsMenu.jsx` | Floating ellipsis (•••) actions menu rendered in a portal |
| `Pagination.jsx` | Presentational pager (pairs with the `usePagination` hook) |
| `StockModal.jsx` | Add / deduct / adjust stock form |
| `AllocationModal.jsx` | Legacy Shopee allocate/deallocate form (UI hidden; reserved for future Open API) |

Import with named exports from each file, for example:

```js
import { Icon } from '../components/Icon'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
```
