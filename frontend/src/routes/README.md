# Frontend routes

URL paths mirror the signed-in role:

| Role | Example |
|------|---------|
| Admin | `/admin/dashboard`, `/admin/inventory`, `/admin/stock-requests` |
| User | `/user/dashboard`, `/user/inventory`, `/user/stock-requests` |

Helpers live in `paths.js`. Login is `/login`. Root `/` redirects to the role home dashboard.
SPA fallback is handled by `serve -s dist` in production.
