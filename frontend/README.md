# RHET Inventory — Frontend

React + Vite SPA. Local development uses Vite; Coolify serves the production `dist/` folder.

## Local

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and set `VITE_API_URL` + Firebase web keys.

## Coolify (Nixpacks)

Base directory: `/frontend`

| Setting | Value |
|---|---|
| Install | `npm install` |
| Build | `npm run build` |
| Start | `npm start` |
| Port | `3000` (or Coolify `PORT`) |

Do **not** set Start Command to `npm run build` — that only builds and exits.

Build-time env (required before deploy):

```env
VITE_API_URL=https://api.rhet-inventory-app.com/api/v1
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=rhet-inventory.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rhet-inventory
VITE_FIREBASE_APP_ID=...
```
