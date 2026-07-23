# RHET Inventory — Frontend

React + Vite SPA. Local development uses Vite; Coolify serves the production `dist/` folder.

## Local

```bash
npm install
npm run dev
```

| Script | URL |
|---|---|
| `npm run dev` | `http://localhost:5173` (falls through to the next free port if busy, often 5174) |
| `npm run dev:5173` | `http://localhost:5173` only (`strictPort`) |
| `npm run dev:5174` | `http://localhost:5174` only (`strictPort`) |

Backend CORS must allow both origins. In `backend/.env`:

```env
FRONTEND_URL=http://localhost:5173,http://localhost:5174
```

Copy `.env.example` to `.env` and set `VITE_API_URL` + Firebase web keys.

## Routes

URLs update as you navigate (admin and user):

| Role | Paths |
|------|--------|
| Admin | `/admin/dashboard`, `/admin/inventory`, `/admin/stock-requests`, … |
| User | `/user/dashboard`, `/user/inventory`, `/user/stock-requests`, … |

Login is `/login`. Production example: `https://inventory.lca-app.com/admin/dashboard`.

## Coolify (Nixpacks)

Base directory: `/frontend`

| Setting | Value |
|---|---|
| Install | `npm install` |
| Build | `npm run build` |
| Start | `npm start` |
| Port | `3000` (or Coolify `PORT`) |
| Is it a static site? | Unchecked (we use `serve`) |
| Publish Directory | leave empty, or `dist` |

Do **not** set Start Command to `npm run build` — that only builds and exits.

Build-time env (required before deploy):

```env
NIXPACKS_NODE_VERSION=20
VITE_API_URL=https://api.rhet-inventory-app.com/api/v1
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=rhet-inventory.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rhet-inventory
VITE_FIREBASE_APP_ID=...
```

Use **Node 20** (`NIXPACKS_NODE_VERSION=20`). Vite 8 / Node 22.11 breaks on Coolify because Rolldown’s Linux native binding fails. This app uses **Vite 6** for reliable builds.
