# Frontend routes

URL paths mirror the signed-in role:

| Role | Example |
|------|---------|
| Admin | `/admin/dashboard`, `/admin/inventory`, `/admin/stock-requests` |
| User | `/user/dashboard`, `/user/inventory`, `/user/stock-requests` |

Helpers live in `paths.js`. Login is `/login`. After sign-in, both admin and user always land on their role **Dashboard** (`/admin/dashboard` or `/user/dashboard`). Root `/` redirects to that same home.
SPA fallback is handled by `serve -s dist` in production.
