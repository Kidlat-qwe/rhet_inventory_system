# Frontend utils

Shared helpers used across pages and print flows.

| File | Purpose |
|------|---------|
| `stockRequestInvoice.js` | Stock-request invoice print. Section order: Invoice + INV-SR → Bill to → Description → Remarks → Authorized / Acknowledged (horizontal breaks between each). |
| `stockRequestChecklist.js` | Dispatch checklist print (invoice-aligned sections: title under brand → Deliver to → Items → signatures side-by-side) + Manila date helpers. |
| `format.js` | Status labels, currency, dates, timezone helpers. |
