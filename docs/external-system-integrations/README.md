# External System Integrations

Guides for partner systems that request stock from the **RHET Centralized Inventory Management System**.

---

## Choose your path

| You are… | Start here |
|---|---|
| **New partner** (HR, vendor, another campus app, etc.) | **[NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md)** |
| **Scoring Shipping Management** (non-Shopee → Manual Orders) | **[SCORING_SHIPPING_MANUAL_ORDERS.md](./SCORING_SHIPPING_MANUAL_ORDERS.md)** |
| **RHET admin** issuing / rotating keys | **[API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md)** |
| **Implementing in Cursor** on a new partner repo | **[NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md)** |
| **Implementing Scoring shipping in Cursor** | **[SCORING_SHIPPING_PASTE_PROMPT.md](./SCORING_SHIPPING_PASTE_PROMPT.md)** |
| **Need full API + Learning Kits detail** | **[STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)** |
| **CMS / PSMS** (already connected) | CMS section below |

---

## New partner systems (full pack)

| Document | Audience |
|---|---|
| **[NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md)** | Partner engineering + ops — architecture, env, catalog, requests, webhooks, test plan |
| **[API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md)** | RHET admins — generate, regenerate, revoke keys; security; handoff |
| **[NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md)** | Paste into partner Cursor / ticket — self-contained implementation brief |
| **[STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)** | Deep API contract — matching rules, Learning Kits, examples, troubleshooting |

### Quick start (new partner)

1. RHET Admin → **API Keys** → generate a key ([API_KEY_MANAGEMENT.md](./API_KEY_MANAGEMENT.md)).
2. Partner stores the key on the **backend only**.
3. Partner implements `GET /catalog`, `POST /stock-requests`, and a webhook receiver.
4. Partner reads [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md) before building Learning Kit forms.
5. Run the onboarding test plan before production.

---

## CMS / PSMS (already integrated)

Use these when changing the **existing** CMS merchandise / stock-request flow. Do **not** create a second live key for CMS unless you are intentionally rotating `PSMS`.

| Document | Audience |
|---|---|
| **[CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md](./CMS_PSMS_STOCK_REQUEST_ALIGNMENT.md)** | Align existing Merchandise stock-request flow after RHET Inventory page changes |
| **[CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md)** | Paste into CMS/PSMS Cursor — self-contained API alignment |
| **[CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md](./CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md)** | Request Stock UI = RHET catalog concept |
| **[CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md](./CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md)** | Superadmin create merchandise fields = RHET vocabulary |
| **[CMS_PSMS_WEBHOOK_UPDATED_AT_FIX_PROMPT.md](./CMS_PSMS_WEBHOOK_UPDATED_AT_FIX_PROMPT.md)** | Fix stuck Pending (`updated_at` missing on CMS) |
| **[CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md](./CMS_PSMS_FULFILL_MATCH_EXISTING_TYPE_PROMPT.md)** | Fulfill credits existing CMS type by `categoryName` |
| **[CMS_PSMS_LEARNING_KIT_REQUEST_PROMPT.md](./CMS_PSMS_LEARNING_KIT_REQUEST_PROMPT.md)** | Enable Learning Kit Request Stock with `components[]` |
| **[CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md](./CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md)** | Category/item dropdowns from RHET catalog |
| **[CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md](./CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md)** | **Paste** — Stocks table shows **Item name** for Workbooks/Backpack/etc. (hide empty Gender/Type) |
| **[CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md](./CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md)** | **Paste** — different Workbooks items must deduct/credit the correct row (CMS-only) |
| **[CMS_PSMS_WORKBOOKS_BLANK_STOCK_ROW_PROMPT.md](./CMS_PSMS_WORKBOOKS_BLANK_STOCK_ROW_PROMPT.md)** | **Paste** — blank Item name on Workbooks/Backpack Stocks (all non-uniform fulfill) |
| **[CMS_PSMS_SHIRT_CATEGORYKIND_REQUEST_STOCK_PROMPT.md](./CMS_PSMS_SHIRT_CATEGORYKIND_REQUEST_STOCK_PROMPT.md)** | **Paste** — Shirt / `LCA_SHIRT` must use Gender+Logo+Size via `categoryKind` (CMS-only) |
| **[CMS_PSMS_BRANCH_NAME_STOCK_REQUEST_PROMPT.md](./CMS_PSMS_BRANCH_NAME_STOCK_REQUEST_PROMPT.md)** | **Paste** — required `branchName` (campus display name) on every `POST /stock-requests` |
| **[CMS_PSMS_STOCK_REQUEST_STATUS_LIFECYCLE_PROMPT.md](./CMS_PSMS_STOCK_REQUEST_STATUS_LIFECYCLE_PROMPT.md)** | **Paste** — Pending → Shipped → Delivered → Returned (cut out FULFILLED) |
| **[CMS_PSMS_BATCH_REFERENCE_INVOICE_PROMPT.md](./CMS_PSMS_BATCH_REFERENCE_INVOICE_PROMPT.md)** | **Paste** — send `batchReference` so multi-item carts group on RHET Manage/invoice |
| **[STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)** § stock-returns | RHET `POST /stock-returns` for CMS Return Stock (`PSMS-RET-*`) |
| **[CMS_PSMS_PASTE_PROMPT.md](./CMS_PSMS_PASTE_PROMPT.md)** | Short pointer to the paste bundle + locked decisions |

### CMS quick path

1. [CMS_PSMS_STOCK_REQUEST_STATUS_LIFECYCLE_PROMPT.md](./CMS_PSMS_STOCK_REQUEST_STATUS_LIFECYCLE_PROMPT.md) — **required now** — Shipped / Delivered / Returned webhooks (no FULFILLED).
2. [CMS_PSMS_BATCH_REFERENCE_INVOICE_PROMPT.md](./CMS_PSMS_BATCH_REFERENCE_INVOICE_PROMPT.md) — **required now** — `batchReference` for multi-item carts (RHET grouping + invoice).
3. [CMS_PSMS_BRANCH_NAME_STOCK_REQUEST_PROMPT.md](./CMS_PSMS_BRANCH_NAME_STOCK_REQUEST_PROMPT.md) — required `branchName`.
4. [CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md) — stock-request API alignment.
5. [CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md](./CMS_PSMS_REQUEST_STOCK_UI_PROMPT.md) — Request Stock form.
6. [CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md](./CMS_PSMS_CREATE_MERCHANDISE_UI_PROMPT.md) — Create Merchandise fields.
7. [CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md](./CMS_PSMS_NON_UNIFORM_ITEM_NAME_COLUMN_PROMPT.md) — Item name on non-uniform Stocks tables.
8. [CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md](./CMS_PSMS_NON_UNIFORM_MULTI_ITEM_DEDUCT_PROMPT.md) — multi-item Workbooks deduct/fulfill.
9. [CMS_PSMS_WORKBOOKS_BLANK_STOCK_ROW_PROMPT.md](./CMS_PSMS_WORKBOOKS_BLANK_STOCK_ROW_PROMPT.md) — blank Workbooks Stocks row after multi-item approve.
10. [CMS_PSMS_LEARNING_KIT_REQUEST_PROMPT.md](./CMS_PSMS_LEARNING_KIT_REQUEST_PROMPT.md) — Learning Kits.
11. [CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md](./CMS_PSMS_CATALOG_DRIVEN_DROPDOWNS_PROMPT.md) — live catalog dropdowns.
12. [CMS_PSMS_SHIRT_CATEGORYKIND_REQUEST_STOCK_PROMPT.md](./CMS_PSMS_SHIRT_CATEGORYKIND_REQUEST_STOCK_PROMPT.md) — Shirt / LCA_SHIRT Gender+Logo+Size via categoryKind.

---

## What RHET owns vs what partners own

| Layer | Owner |
|---|---|
| Central warehouse stock | RHET Inventory (source of truth) |
| Branch / campus / local stock | External system (update after webhook) |
| Approve / reject release | RHET UI users |
| Submit request + handle webhook | Partner backend |
| Integration API key | Issued in RHET → API Keys; stored on partner backend |

---

## Related (implementation notes inside this repo)

- `backend/integrations/EXTERNAL_SYSTEM_INTEGRATION.md` — earlier reference copy (prefer docs/ for partners)
- `backend/integrations/PSMS_API_INTEGRATION.md` — PSMS/CMS-specific notes
- `backend/integrations/EXTERNAL_SYSTEM_PASTE_PROMPT.md` — older paste prompt; prefer [NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md)
- `backend/integrations/README.md` — short in-repo index
