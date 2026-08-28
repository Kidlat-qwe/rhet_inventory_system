# Staff stock-request routes

Base: `/api/v1/stock-requests` (Firebase auth).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List request lines (includes `batchReference`, `internalSellingPrice`) |
| GET | `/:id` | Get one line |
| POST | `/:id/ship` | Ship one pending line (legacy / single) |
| POST | `/:id/deliver` | Mark delivered |
| POST | `/:id/return` | HQ inspect for **CMS branch returns** only (`request_kind = RETURN`, Pending). Body: `{ reusable, notes }`. Reusable restocks warehouse + RETURN movement, then status RETURNED. Staff UI has no Return button on Shipped/Delivered request lines. |
| POST | `/:id/reject` | Reject pending line |
| PATCH | `/:id/quantity` | Reduce pending line qty before ship (`{ quantity, remarks }`); webhook `stock_request.quantity_adjusted` |
| POST | `/invoices/preview` | Invoice draft for selected line ids (ready lines only) |
| POST | `/invoices` | Save invoice snapshot + ship those lines |
| GET | `/invoices?batchReference=&sourceSystem=` | Invoices for a CMS cart group |
| GET | `/invoices/:invoiceId` | Reprint payload |

UI groups lines by `batchReference`. Invoice prices are `inventory.internal_selling_price` frozen at ship time.

Inbound CMS returns (`request_kind = RETURN`) arrive as **Pending** after `POST /integrations/stock-returns` (no warehouse movement yet). Staff inspects each line: reusable → restock + Returned; not reusable → Returned only. Returned tab filters: All / Reusable / Not reusable.
