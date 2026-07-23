# Shared UI Components

Reusable presentational and modal components used across admin and user pages.

| File | Purpose |
|------|---------|
| `Icon.jsx` | SVG icon set |
| `EmptyState.jsx` | Empty list / no-data placeholder |
| `PageLoading.jsx` | Full-page loading indicator |
| `StatusBadge.jsx` | Status pill with color class |
| `MovementTable.jsx` | Stock movement history table |
| `Sidebar.jsx` | App navigation sidebar |
| `Header.jsx` | Top bar with breadcrumbs and sign-out |
| `ItemModal.jsx` | Create / edit a single inventory item. For **Learning Kit**, BOM rows are category-only; concrete items (uniform attrs or item name/SKU) are chosen on the external stock request. |
| `UniformItemModal.jsx` | Add / edit a uniform set: creates or updates both type rows (Polo+Short / Blouse+Skirt / Shirt+Pants) together, sharing gender and size |
| `ActionsMenu.jsx` | Floating ellipsis (•••) actions menu rendered in a portal |
| `Pagination.jsx` | Presentational pager (pairs with the `usePagination` hook) |
| `StockModal.jsx` | Add / deduct / adjust stock form |
| `AllocationModal.jsx` | Allocate / deallocate stock to a sales channel (Shopee) form |

Import with named exports from each file, for example:

```js
import { Icon } from '../components/Icon'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
```
