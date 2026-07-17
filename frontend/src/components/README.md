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
| `ItemModal.jsx` | Create / edit inventory item form |
| `StockModal.jsx` | Add / deduct stock form |

Import with named exports from each file, for example:

```js
import { Icon } from '../components/Icon'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
```
