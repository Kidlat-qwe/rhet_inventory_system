# Admin Pages

Admin role entry points. Workspace pages re-export shared implementations; API Keys and Users contain full admin-only UI.

| File | Type |
|------|------|
| `adminDashboard.jsx` | Wrapper → `DashboardPage` |
| `adminInventory.jsx` | Wrapper → `InventoryPage` |
| `adminStockRequests.jsx` | Wrapper → `StockRequestsPage` |
| `adminOnlineOrders.jsx` | Wrapper → `OnlineOrdersPage` |
| `adminManualOrders.jsx` | Wrapper → `ManualOrdersPage` |
| `adminReleaseLogs.jsx` | Wrapper → `ReleaseLogsPage` |
| `adminStockMovements.jsx` | Wrapper → `StockMovementsPage` |
| `adminCategories.jsx` | Wrapper → `CategoriesPage` |
| `adminApiKeys.jsx` | Full implementation |
| `adminUsers.jsx` | Full implementation (add, edit name, change role, activate/deactivate) |

Import via the barrel:

```js
import { AdminDashboard, AdminInventory, AdminApiKeys } from './pages/admin'
```
