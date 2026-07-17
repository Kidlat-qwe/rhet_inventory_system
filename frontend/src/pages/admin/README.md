# Admin Pages

Admin role entry points. Workspace pages re-export shared implementations; API Keys, Users, and Settings contain full admin-only UI.

| File | Type |
|------|------|
| `adminDashboard.jsx` | Wrapper → `DashboardPage` |
| `adminInventory.jsx` | Wrapper → `InventoryPage` |
| `adminStockRequests.jsx` | Wrapper → `StockRequestsPage` |
| `adminReleaseLogs.jsx` | Wrapper → `ReleaseLogsPage` |
| `adminStockMovements.jsx` | Wrapper → `StockMovementsPage` |
| `adminReports.jsx` | Wrapper → `ReportsPage` |
| `adminCategories.jsx` | Wrapper → `CategoriesPage` |
| `adminApiKeys.jsx` | Full implementation |
| `adminUsers.jsx` | Full implementation (list, role change, **Add user**) |
| `adminSettings.jsx` | Full implementation |

Import via the barrel:

```js
import { AdminDashboard, AdminInventory, AdminApiKeys } from './pages/admin'
```
