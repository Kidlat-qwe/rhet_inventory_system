# User Pages

User role entry points. Each file wraps a shared page and forwards all props unchanged.

| File | Wraps |
|------|-------|
| `userDashboard.jsx` | `DashboardPage` |
| `userInventory.jsx` | `InventoryPage` |
| `userStockRequests.jsx` | `StockRequestsPage` |
| `userOnlineOrders.jsx` | `OnlineOrdersPage` with `canManage` (import, map, fulfill — same as admin) |
| `userReleaseLogs.jsx` | `ReleaseLogsPage` |
| `userStockMovements.jsx` | `StockMovementsPage` |
| `userCategories.jsx` | `CategoriesPage` |

Users do not receive API Keys or Users routes (those remain admin-only).

Import via the barrel:

```js
import { UserDashboard, UserInventory } from './pages/user'
```
