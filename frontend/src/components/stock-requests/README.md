# Stock request UI components

| Component | Purpose |
|-----------|---------|
| `StockRequestQuantityCell.jsx` | Inline edit for pending line quantity before ship. Saves via `PATCH /stock-requests/:id/quantity` and triggers `stock_request.quantity_adjusted` webhook to CMS. |
