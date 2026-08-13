# Staff stock-request routes

Base: `/api/v1/stock-requests` (Firebase auth).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List request lines (includes `batchReference`, `internalSellingPrice`) |
| GET | `/:id` | Get one line |
| POST | `/:id/ship` | Ship one pending line (legacy / single) |
| POST | `/:id/deliver` | Mark delivered |
| POST | `/:id/return` | Mark returned. Body: `{ reusable, notes }`. For **CMS branch returns** (`request_kind = RETURN`, Pending): inspect reusable vs not. Reusable restocks warehouse + RETURN movement, then status RETURNED. For shipped/delivered **requests**: always restocks. |
| POST | `/:id/reject` | Reject pending line |
| POST | `/invoices/preview` | Invoice draft for selected line ids (ready lines only) |
| POST | `/invoices` | Save invoice snapshot + ship those lines |
| GET | `/invoices?batchReference=&sourceSystem=` | Invoices for a CMS cart group |
| GET | `/invoices/:invoiceId` | Reprint payload |

UI groups lines by `batchReference`. Invoice prices are `inventory.internal_selling_price` frozen at ship time.

Inbound CMS returns (`request_kind = RETURN`) arrive as **Pending** after `POST /integrations/stock-returns` (no warehouse movement yet). Staff inspects each line: reusable → restock + Returned; not reusable → Returned only. Returned tab filters: All / Reusable / Not reusable.
