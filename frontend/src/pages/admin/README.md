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
| `adminApiKeys.jsx` | Full implementation. Includes clickable docs (new tab) for how API Keys work, partner onboarding, and docs index under `/docs/`. |
| `adminUsers.jsx` | Full implementation (add, edit name, change role, activate/deactivate) |
| `adminSettings.jsx` | Org settings UI: card sections for branding, inventory default, couriers, uniform/shirt sizes, Help Assistant switch; sticky save bar with dirty-state. |

Import via the barrel:

```js
import { AdminDashboard, AdminInventory, AdminApiKeys, AdminSettings } from './pages/admin'
```
