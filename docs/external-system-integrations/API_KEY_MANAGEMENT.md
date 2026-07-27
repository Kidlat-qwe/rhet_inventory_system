# RHET Inventory — API Key Management

**Audience:** RHET Inventory admins who onboard partner systems (CMS is already connected; use this for **new** systems).

**Related:** [NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md) · [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)

---

## 1. What an integration key is

| Fact | Detail |
|---|---|
| Purpose | Machine-to-machine auth for ` /api/v1/integrations/*` |
| Format | `rhet_<systemslug>_<random>` (example: `rhet_hr_AbCd…`) |
| Storage | RHET stores **SHA-256 hash only** — plaintext key is shown **once** |
| Scope | Identifies one `systemCode` (e.g. `HR`, `VENDOR`, `BRANCH_OPS`) |
| Not for | Browser / mobile apps, Firebase users, or sharing across products |

Every stock request created with that key is tagged with that system’s `sourceSystem` (= `systemCode`).

---

## 2. Generate a key (RHET UI)

1. Sign in as **Admin** → [Inventory UI](https://inventory.lca-app.com) (local: your Vite URL).
2. Open **Management → API Keys**.
3. Click **Generate API key**.
4. Enter a **system name** (display name). RHET derives `systemCode`:
   - Letters/numbers only → uppercased, spaces become `_`
   - Examples: `HR Portal` → `HR_PORTAL`, `Vendor Shop` → `VENDOR_SHOP`
5. Choose **expiration**:
   - `No expiration` (typical for production partners)
   - `7 days` (staging / trial)
   - `1 month`
6. Submit.

### Reveal modal (copy immediately)

The modal shows values **once**. If you close it without saving, regenerate the key.

| Field | Example | Partner env |
|---|---|---|
| Integration API URL | `https://api-inventory.lca-app.com/api/v1/integrations` | `INVENTORY_API_URL` |
| API key | `rhet_hr_….` | `INVENTORY_INTEGRATION_KEY` (or `INVENTORY_API_KEY`) |
| System code | `HR` | Use as `externalReference` prefix: `HR-123` |

Use **Copy .env configuration** when available, then send the block to the partner over a secure channel (password manager / encrypted message — not chat screenshots left in Slack forever).

Suggested `.env` for the partner backend:

```env
INVENTORY_API_URL=https://api-inventory.lca-app.com/api/v1/integrations
INVENTORY_INTEGRATION_KEY=rhet_<system>_<secret>
INVENTORY_WEBHOOK_URL=https://partner-api.example.com/api/webhooks/inventory
```

---

## 3. After generation — RHET admin checklist

- [ ] Partner confirmed they stored the key on the **backend only**
- [ ] Partner `systemCode` is unique and documented (who owns this key)
- [ ] Partner webhook URL is HTTPS and reachable from RHET’s network
- [ ] Optional: store the partner’s default webhook on the integration client record (if your UI supports it) **or** require `webhookUrl` on every `POST /stock-requests`
- [ ] Smoke-test: partner calls `GET /catalog` → RHET API Keys card moves toward **Connected** after first request

---

## 4. Regenerate a key

Use when a key may be leaked, a partner rotates secrets, or someone lost the plaintext.

1. **API Keys** → find the client → **Regenerate**.
2. Choose expiration again.
3. Copy the **new** key to the partner.
4. Partner updates Coolify / secrets and redeploys.
5. Old key stops working immediately (hash replaced).

Coordinate a short maintenance window so in-flight jobs do not use the old key.

---

## 5. Revoke a key

Use when a partner is decommissioned or temporarily cut off.

1. **API Keys** → **Revoke**.
2. Hash cleared; integration calls return **401**.
3. Existing stock request history remains; new requests cannot be created until a new key is generated.

---

## 6. Admin API (advanced)

RHET UI uses these Firebase-authenticated admin endpoints (not for partners):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/integration-clients` | List clients + connection state |
| `POST` | `/api/v1/integration-clients` | Create client + return plaintext key once |
| `PATCH` | `/api/v1/integration-clients/:systemCode` | Update display name / webhook / status |
| `POST` | `/api/v1/integration-clients/:systemCode/regenerate-key` | New key |
| `POST` | `/api/v1/integration-clients/:systemCode/revoke-key` | Clear key |

Partners **never** call these. They only use `/api/v1/integrations/*` with `X-Integration-Key`.

---

## 7. Auth headers partners must send

```http
X-Integration-Key: rhet_<system>_<secret>
```

Also accepted:

```http
Authorization: Bearer rhet_<system>_<secret>
```

Base path for all partner calls:

```text
{INVENTORY_API_URL}   →   …/api/v1/integrations
```

| Call | Example |
|---|---|
| Catalog | `GET …/catalog` |
| Availability | `GET …/availability?…` |
| Create requests | `POST …/stock-requests` |
| Poll status | `GET …/stock-requests/:id` |

---

## 8. Security rules

| Do | Do not |
|---|---|
| One key per partner system | Share CMS/`PSMS` key with a new product |
| Store key in server secrets / Coolify | Put key in `VITE_*`, `NEXT_PUBLIC_*`, mobile apps |
| Prefer short expiry for sandboxes | Commit keys to git |
| Rotate on staff offboarding / leak | Email the key in plain text without rotation plan |
| Prefer per-request `webhookUrl` | Assume RHET’s `PSMS_WEBHOOK_URL` fallback is correct for every partner |

---

## 9. Connection states (UI)

| State | Meaning |
|---|---|
| Not configured | No key hash |
| Configured | Key exists; no successful traffic yet |
| Connected | At least one authenticated request recorded |
| Expired | Past `api_key_expires_at` — regenerate |

---

## 10. Hand off to the partner

Send them:

1. This folder’s [NEW_PARTNER_ONBOARDING.md](./NEW_PARTNER_ONBOARDING.md)
2. Deep API guide [STOCK_REQUEST_INTEGRATION.md](./STOCK_REQUEST_INTEGRATION.md)
3. Optional paste prompt [NEW_PARTNER_PASTE_PROMPT.md](./NEW_PARTNER_PASTE_PROMPT.md)
4. Their `.env` block (API URL + key + their webhook URL)

CMS / PSMS is **already** onboarded — do not regenerate the live `PSMS` key unless you intend to rotate it with the CMS team.
