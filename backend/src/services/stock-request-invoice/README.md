# Stock request invoices

Shipment invoices for CMS stock-request **groups**.

- One invoice per Confirm ship (selected ready lines only).
- Staff can leave in-stock lines unchecked for a later shipment.
- Unit price = `inventory.internal_selling_price` snapshot.
- Remaining Pending lines stay in the same `batch_reference` for a later invoice (`INV-…` + `shipment_seq` 2, 3, …).

Service: `../stock-request-invoice.service.js`.
