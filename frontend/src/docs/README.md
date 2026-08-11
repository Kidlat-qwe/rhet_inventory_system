# Integration docs (bundled)

HTML guides bundled into the SPA via Vite `?raw` imports so **API Keys → Documentation**
links work on deployed hosts (where `/docs/*.html` is often rewritten to `index.html`).

| File | Purpose |
|------|---------|
| `openIntegrationDoc.js` | Opens a doc in a new tab using a blob URL; rewrites logo/cross-links |
| `api-key-management.html` | How API Keys work |
| `partner-onboarding.html` | Partner onboarding overview |
| `index.html` | Docs index |

Copies also remain under `frontend/public/docs/` for local direct URL access.
