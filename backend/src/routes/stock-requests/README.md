# Staff stock-request routes

Base: `/api/v1/stock-requests` (Firebase auth).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List request lines (includes `batchReference`, `internalSellingPrice`) |
| GET | `/:id` | Get one line |
| POST | `/:id/ship` | Ship one pending line (legacy / single) |
| POST | `/:id/deliver` | Mark delivered |
| POST | `/:id/return` | Return / restock |
| POST | `/:id/reject` | Reject pending line |
| POST | `/invoices/preview` | Invoice draft for selected line ids (ready lines only) |
| POST | `/invoices` | Save invoice snapshot + ship those lines |
| GET | `/invoices?batchReference=&sourceSystem=` | Invoices for a CMS cart group |
| GET | `/invoices/:invoiceId` | Reprint payload |

UI groups lines by `batchReference`. Invoice prices are `inventory.internal_selling_price` frozen at ship time.

Inbound CMS returns (`request_kind = RETURN`) appear on the Returned tab as view-only groups. Warehouse stock was already increased on `POST /integrations/stock-returns`.
