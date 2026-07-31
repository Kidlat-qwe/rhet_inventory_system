# Manual Orders

HQ direct-to-customer shipments fulfilled with a RHET-provided courier (not Shopee / marketplace).

## API (`/api/v1/manual-orders`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List orders (optional `fulfillmentStatus`) |
| GET | `/:id` | Order + line items |
| POST | `/` | Create order with inventory line items |
| PATCH | `/:id` | Update customer / courier / tracking / notes |
| POST | `/:id/fulfillment-status` | Advance fulfillment (`READY_TO_SHIP` → `SHIPPED` deducts stock) |
| POST | `/:id/cancel` | Cancel before ship |
| POST | `/:id/confirm-return` | Confirm return (`reusable` restocks) |

Auth: Firebase staff (`ADMIN` or `USER`).

## Stock

Marking **SHIPPED** creates `MANUAL_SALE` movements per line. Reusable return confirmation creates `RETURN` movements.

## Schema

Migration: `024_manual_orders.sql` — tables `manual_orders`, `manual_order_items`.
