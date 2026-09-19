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
| `adminApiKeys.jsx` | Full implementation. Docs open via bundled HTML (`src/docs/openIntegrationDoc.js`) so guides work on deployed SPA hosts, not only localhost. |
| `adminUsers.jsx` | Full implementation (add, edit name, change role, activate/deactivate) |
| `adminSettings.jsx` | Org settings UI: branding, inventory default, couriers, uniform/shirt sizes, **shirt logos**, Help Assistant + **Snowfall**, **Delivered report emails** (daily 5pm / month-end Asia/Manila, recipient list, send-now). Sticky save bar with dirty-state. |

Import via the barrel:

```js
import { AdminDashboard, AdminInventory, AdminApiKeys, AdminSettings } from './pages/admin'
```
