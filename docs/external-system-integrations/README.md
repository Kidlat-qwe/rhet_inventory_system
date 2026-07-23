# External System Integrations

Guides for any partner system that requests stock from the **RHET Centralized Inventory Management System**.

| Document | Audience |
|---|---|
| **[STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)** | Any external engineering team — auth, catalog, stock requests, Learning Kits, webhooks, checklist |
| **[CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md](./CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md)** | **PSMS / CMS team** — align existing Merchandise stock-request flow after RHET Inventory page changes |
| **[CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md)** | **Paste this into CMS/PSMS Cursor** — self-contained (no other RHET docs required); Learning Kits blocked this pass |
| **[CMS_PSMS_PASTE_PROMPT.md](./CMS_PSMS_PASTE_PROMPT.md)** | Short pointer to the paste bundle + locked decisions |

Related (implementation notes inside this repo):

- `backend/integrations/EXTERNAL_SYSTEM_INTEGRATION.md` — earlier reference copy
- `backend/integrations/PSMS_API_INTEGRATION.md` — PSMS/CMS-specific notes
- `backend/integrations/EXTERNAL_SYSTEM_PASTE_PROMPT.md` — short paste prompt for a **new** partner system

## What RHET owns vs what you own

| Layer | Owner |
|---|---|
| Central warehouse stock | RHET Inventory (source of truth) |
| Branch / campus / local stock | Your external system (update after webhook) |
| Approve / reject release | RHET UI users |
| Submit request + handle webhook | Your backend |

## Quick start

### New partner system

1. RHET Admin → **API Keys** → generate a key for your system.
2. Store the key on your **backend only**.
3. Implement `GET /catalog`, `POST /stock-requests`, and a webhook receiver.
4. Read [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) end to end before building Learning Kit forms.

### Existing CMS / PSMS (already connected)

1. Open [CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md).
2. Copy the fenced markdown block into the **CMS/PSMS** Cursor chat (self-contained).
3. This pass: **block Learning Kits**; harden uniform mapping (Polo ≠ Shirt); keep webhooks / Approved By / idempotent fulfill.
4. Optional: read [CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md](./CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md) for CMS touchpoint detail.
5. Re-run the verification plan before production deploy.
