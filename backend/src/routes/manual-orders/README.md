# Manual Orders

HQ and Scoring **non-Shopee** courier shipments (Lalamove, LBC, J&T, Others). Status tabs match **Scoring Shipping Management**.

Shopee marketplace orders stay on **Online Orders**.

## Status modules (Shipping Management–aligned)

| Tab | Internal code | Notes |
|---|---|---|
| ALL | — | Every order |
| Pending | `PENDING` | Reserved / pre-process |
| Processing | `PROCESSING` | Active warehouse work (no Ready-to-ship step) |
| Shipped | `SHIPPED` | Handed to courier — **deducts** warehouse stock (`MANUAL_SALE`) |
| Delivered | `DELIVERED` | Customer received (was `RECEIVED`) |
| Error | `ERROR` | Cancelled / failed (was `CANCELLED`) |
| Ineligible | `INELIGIBLE` | Not fulfillable |
| Needs attention | `NEEDS_ATTENTION` | Header received (e.g. from Scoring) but line items not mapped yet |

RHET-only return flow (not Scoring tabs): `RETURN` → `RETURN_CONFIRMED` (reusable restock).

**Removed:** `READY_TO_SHIP` — Processing goes directly to Shipped.

## Staff API (`/api/v1/manual-orders`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List orders (optional `fulfillmentStatus`) |
| GET | `/:id` | Order + line items |
| POST | `/` | Create order (`items` optional; empty → `NEEDS_ATTENTION`) |
| PATCH | `/:id` | Update customer / courier / tracking / notes / student / program |
| PUT | `/:id/items` | Map / replace line items before ship |
| POST | `/:id/fulfillment-status` | Advance status (`PROCESSING` → `SHIPPED` deducts stock) |
| POST | `/:id/cancel` | Cancel before ship → `ERROR` |
| POST | `/:id/confirm-return` | Confirm return (`reusable` restocks) |

Auth: Firebase staff (`ADMIN` or `USER`).

## Partner API (`/api/v1/integrations/manual-orders`)

Auth: `X-Integration-Key`. See [SCORING_SHIPPING_MANUAL_ORDERS.md](../../../docs/external-system-integrations/SCORING_SHIPPING_MANUAL_ORDERS.md).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/` | Scoring header-only create |
| GET | `/:id` | Poll |
| GET | `/by-reference/:reference` | Poll by external reference |
| POST | `/:id/fulfillment-status` | Scoring sets Delivered / Error |
| POST | `/by-reference/:reference/fulfillment-status` | Same by reference |

Webhooks to partner: `manual_order.created` / `shipped` / `delivered` / `error`.

## Schema

- `024_manual_orders.sql` — tables `manual_orders`, `manual_order_items`
- `032_manual_orders_shipping_status.sql` — Shipping Management statuses + Scoring metadata columns
- `033_manual_orders_webhook.sql` — `webhook_url` + notes length 2000
