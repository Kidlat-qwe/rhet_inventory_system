# RHET Centralized Inventory Management System

A modular school-merchandise inventory system for uniforms, bags, books, accessories, and other products. The repository contains a responsive React admin interface, a protected Express REST API, and a transactional PostgreSQL schema.

## 1. Project architecture

```text
React admin client
  └─ Firebase Web SDK (sign-in and ID token)
       └─ HTTPS: Authorization: Bearer <ID token>
            └─ Express API
                 ├─ security + Firebase token middleware
                 ├─ request validation / controllers
                 ├─ inventory + reporting services
                 └─ node-postgres transaction layer
                      └─ PostgreSQL (also manageable in pgAdmin)
```

Firebase owns credentials, password policies, and authentication sessions. PostgreSQL remains the authority for whether a Firebase identity is an active system administrator. Business logic and stock balances live only in the API/database tier.

## 2. Folder structure

```text
frontend/
  src/
    App.jsx                 responsive dashboard and inventory views
    App.css                 component and responsive styles
    services/
      firebase.js           Firebase Web SDK initialization
      api.js                authenticated REST client
  .env.example
backend/
  database/migrations/      versioned PostgreSQL DDL
  src/
    config/                 validated environment and Firebase Admin setup
    controllers/            HTTP request/response adapters
    database/               pool, transactions, migration runner
    middleware/             authentication, validation, error handling
    routes/                 REST route definitions
    services/               inventory and dashboard business logic
    utils/                  response/error utilities
    validation/             Zod request schemas
  .env.example
```

For a larger UI, split `App.jsx` into `components`, `features/dashboard`, `features/inventory`, `features/reports`, `hooks`, and `contexts/AuthContext`. The current single entry makes the provided design easy to preview while API/auth concerns are already separate.

## 3–5. Database schema and relationships

Run [001_initial_schema.sql](backend/database/migrations/001_initial_schema.sql) directly in pgAdmin's Query Tool or use `npm run db:migrate` in `backend`.

- `categories (1) → (many) inventory`: every item belongs to a controlled category.
- `inventory (1) → (many) stock_movements`: the immutable transaction history for an item.
- `users (1) → (many) stock_movements`: records the responsible authenticated user.
- `users` also relates to inventory through `created_by` and `updated_by`.

IDs are UUIDs, money is `NUMERIC(12,2)`, quantities are non-negative integers, identifiers and emails are unique, timestamps are timezone-aware, and foreign keys prevent orphan records. Search, status, category, update-time, and movement-history indexes cover common access paths. Timestamp updates are explicitly written by the API rather than PostgreSQL trigger functions, keeping the schema usable on Windows installations where Application Control blocks `plpgsql.dll`.

`inventory.status` is a stored generated column. Its precedence is `INACTIVE`, `OUT_OF_STOCK` (zero), `LOW_STOCK` (at or below the per-item threshold), then `ACTIVE`. Admins edit `lifecycle_status`; they never edit computed availability. This prevents status/quantity disagreement.

## 6. REST API design

All paths except health require `Authorization: Bearer <Firebase ID token>`. Responses use `{ "success": true, "data": ..., "meta": ... }`; failures use `{ "success": false, "error": { "code", "message", "details?" } }`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Load-balancer health check |
| GET | `/api/v1/me` | Current PostgreSQL admin profile |
| GET | `/api/v1/dashboard` | Counts, value, alerts, category summary, recent activity |
| GET/POST | `/api/v1/categories` | List/create categories |
| GET/POST | `/api/v1/inventory` | Filtered, sorted list/create item |
| GET/PATCH | `/api/v1/inventory/:id` | Read/edit/archive item metadata |
| POST | `/api/v1/inventory/:id/movements` | Add, deduct, adjust, return, damage, release, or cancel stock |
| GET | `/api/v1/stock-movements` | Paginated audit history and date filters |
| GET | `/api/v1/online-orders` | List Shopee/marketplace online orders |
| GET | `/api/v1/online-orders/:id` | Online order detail with line items |
| POST | `/api/v1/online-orders/import` | Import Shopee CSV export (admin) |
| POST | `/api/v1/online-orders/manual` | Create manual online order (admin) |
| POST | `/api/v1/online-orders/items/:id/resolve` | Map Shopee SKU to inventory and deduct (admin) |
| GET | `/api/v1/reports/inventory.csv` | Current stock/valuation/category/status CSV |

Inventory query parameters: `search`, `categoryId`, `variation`, `status`, `sortBy`, `order`, `page`, `limit`. Movement parameters: `inventoryId`, `type`, `from`, `to`, `page`, `limit`. Low-stock and out-of-stock reports are inventory requests with the corresponding `status`; category reports use `categoryId`; valuation is included in the CSV. The movement endpoint supplies date-range transaction reports and can be exported client-side or extended with the same CSV serializer.

## 7–8. Firebase Authentication flow

1. Create a Firebase project, enable the chosen provider (email/password is sufficient), and register a web app.
2. The React Firebase SDK signs in and maintains the browser session.
3. Before each API call, `services/api.js` obtains the current ID token and sends it as a Bearer token.
4. `requireAuth` uses Firebase Admin `verifyIdToken(token, true)`, checking signature, expiry, audience, issuer, and revocation.
5. The middleware looks up `firebase_uid` in `users`. The account must exist and be `ACTIVE`.
6. A Firebase user with the custom claim `admin: true` is provisioned on first access. Set this claim only from a trusted one-time administration script or Cloud Function. Existing database users do not need the claim on every request.
7. The controller receives `req.admin.user_id`, which is written to every movement.

For local UI/API development only, `AUTH_BYPASS=true` creates a local admin. The environment parser forcibly disables this bypass in production.

## 9. Inventory and stock movement logic

Initial stock creates an initial `STOCK_IN` movement. Later quantity changes are never accepted by the metadata update endpoint. They must use the movement endpoint:

```json
{ "movementType": "STOCK_IN", "quantity": 20, "referenceNumber": "DR-1024", "remarks": "July delivery" }
```

For a correction, send `{ "movementType": "ADJUSTMENT", "newStock": 37 }`. The service begins a transaction, locks the inventory row with `SELECT ... FOR UPDATE`, calculates the delta, rejects negative results, updates the balance, inserts history, and commits. Concurrent requests therefore serialize on the item row. Database checks independently verify `new_stock = previous_stock + stock_delta` and `quantity = abs(stock_delta)`.

## 10–11. React admin interfaces

The provided frontend includes:

- dashboard metric cards, inventory value, category distribution, alerts, and recent activity;
- searchable/filterable inventory table with status badges and responsive overflow;
- add/edit merchandise form with native validation;
- add/deduct stock dialog with a new-balance preview;
- stock movement history and report/module navigation;
- collapsible mobile sidebar and responsive dashboard grids.

It starts with interactive sample records so the design can be reviewed without infrastructure. Replace the state initializer with `api('/inventory')` and submit forms through the service after Firebase configuration; keep all writes server-authoritative and refresh from the returned resource.

## 12. Validation rules

| Field | Rule |
|---|---|
| SKU | trimmed, uppercased, 2–64 characters, globally unique |
| Item name | trimmed, 2–180 characters, non-blank |
| Category | valid category UUID / foreign key |
| Variation | optional, up to 180 characters |
| Price | numeric, 0–9,999,999,999.99 |
| Stocks / threshold | integer, zero or greater |
| Movement quantity | positive integer; deduction cannot exceed balance |
| Remarks / reference | optional, up to 500 / 100 characters |
| Status | lifecycle is only `ACTIVE` or `INACTIVE`; availability is derived |

Validation is applied in the React form for feedback, in Zod for API safety, and through PostgreSQL constraints as the final integrity boundary.

## 13. Error strategy

- Zod errors return HTTP 422 / `VALIDATION_ERROR` with field details.
- Missing/invalid/unauthorized Firebase identities return 401 or 403.
- Missing resources return 404; duplicate SKU/email/category returns 409.
- Insufficient stock and no-op corrections return explicit 409/422 codes.
- Known PostgreSQL constraint codes are mapped to safe messages; internals are logged server-side, never exposed.
- Promise errors funnel through one Express handler. Transactions always roll back on error.
- The frontend should show field messages for 422, a toast for domain conflicts, and redirect to login on 401. Attach a request/correlation ID and structured logger in production.

## 14. Security recommendations

- Store Firebase service credentials in the hosting platform's secret manager, never Git or frontend variables.
- Permit only exact HTTPS frontend origins in CORS and use separate Firebase projects per environment.
- Enforce MFA for admins, strong password/provider policies, short session lifetimes, and immediate user/claim revocation during offboarding.
- Grant the API a restricted PostgreSQL role; use a separate migration owner. Require TLS and encrypted backups.
- Keep Helmet, body-size limits, rate limiting, parameterized SQL, input limits, and dependency scanning enabled.
- Add an append-only audit stream for profile/category/config changes; prohibit UPDATE/DELETE on movement rows for the runtime DB role.
- Never log Bearer tokens or service keys. Redact personal data and define retention/backup-restore procedures.
- Use pagination limits and export row limits to resist expensive queries. For high-volume exports, generate asynchronously in object storage.

## 15. Development plan

1. Create PostgreSQL, run migrations, and verify the schema in pgAdmin.
2. Configure Firebase providers, web credentials, Admin credentials, and an initial `admin: true` custom claim.
3. Start the protected API and test health, token verification, admin provisioning, and inventory transactions.
4. Connect the provided frontend forms/tables to the API, add an auth context/login screen, loading states, and toasts.
5. Add category/admin management, full report filters, movement CSV/XLSX generation, and audit events.
6. Add unit tests for delta rules, integration tests against a disposable PostgreSQL database, and browser tests for critical admin workflows.
7. Run concurrency, access-control, restore, accessibility, responsive, and user-acceptance testing.
8. Deploy to staging, migrate, seed controlled categories/admins, validate monitoring, then promote to production.

## Local setup

```powershell
# PostgreSQL database must already exist
cd backend
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev

# second terminal
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

For API-only local development, set `AUTH_BYPASS=true`. Do not use it in a deployed environment.

## 16. Deployment recommendations

Build the frontend with `npm run build` and serve `frontend/dist` from Firebase Hosting, Cloudflare Pages, Vercel, or a static CDN. Deploy the stateless API as a container to Cloud Run, Azure Container Apps, Render, Railway, or ECS. Use managed PostgreSQL (Cloud SQL, Azure Database for PostgreSQL, RDS, Neon, or Supabase database-only), private networking where available, automated point-in-time backups, and a connection pooler for autoscaling workloads.

Run migrations as a one-off release job before API rollout—not from every application replica. Configure health checks on `/health`, centralized logs and alerts, error monitoring, uptime checks, database metrics, and secret rotation. Use separate development/staging/production resources and a CI pipeline that installs locked dependencies, checks syntax/lint, runs tests, builds the UI, scans dependencies/images, applies staging migrations, and deploys with rollback support.
#   r h e t _ i n v e n t o r y _ s y s t e m  
 