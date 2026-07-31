# Stock request integration routes

Base: `/api/v1/integrations` (X-Integration-Key or Bearer).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/catalog` | Categories + items |
| GET | `/availability` | Stock check |
| POST | `/stock-requests` | Create (requires `branchName`) |
| GET | `/stock-requests/:id` | Poll status |
| POST | `/stock-requests/:id/deliver` | CMS branch confirm receipt (SHIPPED → DELIVERED) |

Staff UI routes (Firebase): `/api/v1/stock-requests/:id/ship|deliver|return|reject`.
