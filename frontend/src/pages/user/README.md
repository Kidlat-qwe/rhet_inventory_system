# User Pages

User role entry points. Each file wraps a shared page and forwards all props unchanged.

| File | Wraps |
|------|-------|
| `userDashboard.jsx` | `DashboardPage` |
| `userInventory.jsx` | `InventoryPage` |
| `userStockRequests.jsx` | `StockRequestsPage` |
| `userReleaseLogs.jsx` | `ReleaseLogsPage` |
| `userStockMovements.jsx` | `StockMovementsPage` |
| `userReports.jsx` | `ReportsPage` |
| `userCategories.jsx` | `CategoriesPage` |

Users do not receive API Keys, Users, or Settings routes (those remain admin-only).

Import via the barrel:

```js
import { UserDashboard, UserInventory } from './pages/user'
```
