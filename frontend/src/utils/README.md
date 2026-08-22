# Frontend utils

Shared helpers used across pages and print flows.

| File | Purpose |
|------|---------|
| `stockRequestInvoice.js` | Stock-request invoice print / PDF download. Print uses the HTML layout. **Download invoice** renders that same HTML via `html2canvas` + `jspdf` into a PDF blob (`blob:…`) so the new-tab PDF matches the print invoice (logo, sections, ₱ amounts, signatures). |
| `stockRequestChecklist.js` | Dispatch checklist print (invoice-aligned sections: title under brand → Deliver to → Items → signatures side-by-side) + Manila date helpers. |
| `format.js` | Status labels, currency, dates, timezone helpers. `normalizeInventoryText` lowercases item names and turns spaces/hyphens into `_`. Live typing keeps a trailing `_`; save trims edges. |
