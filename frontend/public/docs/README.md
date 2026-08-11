# In-app integration docs

Static HTML guides under `public/docs` (local direct URLs) and bundled copies under `src/docs` (opened from **Admin → API Keys** via `openIntegrationDoc.js`).

Production SPAs often rewrite `/docs/*.html` to the React app, so the API Keys page opens bundled HTML in a new tab instead of linking to `/docs/...`.

| File | Purpose |
|------|---------|
| `index.html` | Docs index |
| `api-key-management.html` | How the API Keys page works (generate / regenerate / revoke) |
| `partner-onboarding.html` | High-level partner onboarding overview |

Source-of-truth Markdown for engineers remains in `docs/external-system-integrations/`.
