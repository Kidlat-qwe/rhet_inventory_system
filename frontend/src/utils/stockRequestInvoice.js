import { formatManilaDate, formatManilaDateTime } from './stockRequestChecklist'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function invoiceLines(invoice) {
  return Array.isArray(invoice?.lines) ? invoice.lines : []
}

export function formatInvoiceMoney(value) {
  const amount = Number(value) || 0
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildInvoiceHtml({
  invoice,
  printedBy = '',
  printedAt = new Date(),
  logoUrl = '',
  organizationName = 'RHET Inventory System',
  timezone = 'Asia/Manila',
}) {
  const brandName = String(organizationName || '').trim() || 'RHET Inventory System'
  const logoSrc = logoUrl
    || (typeof window !== 'undefined' ? `${window.location.origin}/rhet-logo.png` : '/rhet-logo.png')
  const when = formatManilaDateTime(printedAt, timezone)
  const invoiceDate = formatManilaDate(invoice?.createdAt || printedAt, timezone)
  const invoiceNumber = invoice?.invoiceNumber || 'DRAFT'
  const isDraft = Boolean(invoice?.draft) || !invoice?.invoiceNumber
  const lines = invoiceLines(invoice)
  const subtotal = Number(invoice?.subtotal ?? lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0))
  const dispatcherName = String(printedBy || invoice?.createdByName || '').trim() || '—'
  const lineCount = lines.length

  const rows = lines.map((line) => `
    <tr>
      <td>
        <strong>${escapeHtml(line.itemName || line.categoryName || 'Item')}</strong>
        ${line.variation ? `<small>${escapeHtml(line.variation)}</small>` : ''}
        ${line.categoryName && line.itemName ? `<small>${escapeHtml(line.categoryName)}</small>` : ''}
      </td>
      <td class="sku">${escapeHtml(line.sku || '—')}</td>
      <td class="qty">${escapeHtml(String(line.quantity ?? ''))}</td>
      <td class="money">${escapeHtml(formatInvoiceMoney(line.unitPrice))}</td>
      <td class="money">${escapeHtml(formatInvoiceMoney(line.lineTotal))}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 12mm; }
    body {
      font-family: Georgia, "Times New Roman", Times, serif;
      color: #1c2434;
      margin: 0;
      padding: 8px 4px 16px;
      font-size: 12px;
      background: #fff;
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      padding-bottom: 18px;
      border-bottom: 3px solid #1c2434;
    }
    .seller {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
    }
    .brand-logo {
      width: 64px;
      height: 64px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e6e9ef;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .seller-copy h2 {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 15px;
      margin: 0 0 4px;
      letter-spacing: -.2px;
    }
    .seller-copy p {
      margin: 0;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #5b6474;
      line-height: 1.45;
    }
    .doc-title {
      text-align: right;
      min-width: 240px;
    }
    .doc-title h1 {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 2px;
      margin: 0;
      color: #1c2434;
    }
    .doc-title .invoice-no {
      margin-top: 6px;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 13px;
      font-weight: 700;
    }
    .draft-tag {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 8px;
      border: 1px solid #c9852a;
      color: #8a4b00;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .parties {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 28px;
      margin: 22px 0 20px;
    }
    .party-label {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #7a8494;
      margin-bottom: 8px;
    }
    .party-name {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.35;
      margin: 0 0 6px;
    }
    .party-meta {
      margin: 0;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #3a4454;
      line-height: 1.55;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 12px;
    }
    .meta-table th,
    .meta-table td {
      border: 0;
      padding: 5px 0;
      text-align: left;
      vertical-align: top;
    }
    .meta-table th {
      width: 42%;
      color: #7a8494;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      background: transparent;
    }
    .meta-table td { font-weight: 600; }
    .notes {
      margin: 0 0 18px;
      padding: 10px 12px;
      background: #f7f8fa;
      border-left: 3px solid #1c2434;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 12px;
    }
    .notes span {
      display: block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #7a8494;
      margin-bottom: 4px;
    }
    table.lines {
      width: 100%;
      border-collapse: collapse;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    }
    table.lines th,
    table.lines td {
      border: 0;
      border-bottom: 1px solid #e6e9ef;
      padding: 11px 8px;
      text-align: left;
      vertical-align: top;
      background: transparent;
      color: #1c2434;
    }
    table.lines thead th {
      border-bottom: 2px solid #1c2434;
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #5b6474;
      font-weight: 700;
    }
    table.lines td small { display: block; color: #7a8494; margin-top: 3px; font-size: 10px; }
    .sku { width: 150px; color: #3a4454; }
    .qty { width: 54px; text-align: right; white-space: nowrap; }
    .money { width: 110px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .totals-wrap {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .totals {
      width: 280px;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 7px 0;
      font-size: 12px;
      color: #5b6474;
    }
    .totals .grand {
      margin-top: 4px;
      border-top: 2px solid #1c2434;
      padding-top: 10px;
      font-size: 15px;
      font-weight: 800;
      color: #1c2434;
    }
    .kind {
      margin-top: 6px;
      text-align: right;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #7a8494;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 40px;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    }
    .sign-line {
      border-top: 1px solid #1c2434;
      padding-top: 8px;
      min-height: 56px;
    }
    .sign-line strong { display: block; font-size: 11px; margin-bottom: 4px; }
    .sign-line span { display: block; font-size: 10px; color: #7a8494; }
    .sign-value { font-weight: 700; color: #1c2434; font-size: 12px; margin-bottom: 18px; }
    .footnote {
      margin-top: 28px;
      color: #7a8494;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 9px;
      line-height: 1.5;
    }
    @media print {
      body { padding: 0; }
      .notes { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    @media (max-width: 720px) {
      .letterhead, .parties, .signs { display: block; }
      .doc-title { text-align: left; margin-top: 16px; }
      .totals-wrap { justify-content: stretch; }
      .totals { width: 100%; }
    }
  </style>
</head>
<body>
  <header class="letterhead">
    <div class="seller">
      <img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(brandName)} logo" />
      <div class="seller-copy">
        <h2>${escapeHtml(brandName)}</h2>
        <p>Warehouse billing · Internal branch restock<br />This is an invoice, not a dispatch checklist.</p>
      </div>
    </div>
    <div class="doc-title">
      <h1>INVOICE</h1>
      <div class="invoice-no">${escapeHtml(invoiceNumber)}</div>
      ${isDraft ? '<span class="draft-tag">Draft — not yet shipped</span>' : ''}
    </div>
  </header>

  <section class="parties">
    <div>
      <div class="party-label">Bill to</div>
      <p class="party-name">${escapeHtml(invoice?.branchName || '—')}</p>
      <p class="party-meta">Requested by ${escapeHtml(invoice?.requestedBy || '—')}</p>
    </div>
    <div>
      <div class="party-label">Invoice details</div>
      <table class="meta-table">
        <tr><th>Invoice date</th><td>${escapeHtml(invoiceDate)}</td></tr>
        <tr><th>Shipment</th><td>${escapeHtml(String(invoice?.shipmentSeq || 1))} of this request</td></tr>
        <tr><th>Reference</th><td>${escapeHtml(invoice?.batchReference || '—')}</td></tr>
        <tr><th>Prepared by</th><td>${escapeHtml(dispatcherName)}</td></tr>
        <tr><th>Line items</th><td>${escapeHtml(String(lineCount))}</td></tr>
      </table>
    </div>
  </section>

  ${invoice?.reason ? `
  <div class="notes">
    <span>Remarks</span>
    ${escapeHtml(invoice.reason)}
  </div>` : ''}

  <table class="lines">
    <thead>
      <tr>
        <th>Description</th>
        <th>SKU</th>
        <th class="qty">Qty</th>
        <th class="money">Unit price</th>
        <th class="money">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">No shippable lines</td></tr>'}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${escapeHtml(formatInvoiceMoney(subtotal))}</span></div>
      <div class="row grand"><span>Total due</span><span>${escapeHtml(formatInvoiceMoney(subtotal))}</span></div>
      <div class="kind">Internal selling price · PHP</div>
    </div>
  </div>

  <div class="signs">
    <div class="sign-line">
      <strong>Authorized by (warehouse)</strong>
      <div class="sign-value">${escapeHtml(dispatcherName)}</div>
      <span>Signature / date</span>
    </div>
    <div class="sign-line">
      <strong>Acknowledged by (branch)</strong>
      <div class="sign-value">${escapeHtml(invoice?.requestedBy || '')}</div>
      <span>Signature / date</span>
    </div>
  </div>

  <p class="footnote">
    Amounts use RHET internal selling price at invoice time. This invoice covers only goods in this shipment.
    Remaining pending lines stay on the same request group and will appear on a later invoice if shipped.
    Printed ${escapeHtml(when)}.
  </p>
</body>
</html>`
}

export function openInvoicePrintWindow(options) {
  const html = buildInvoiceHtml(options)

  const existing = document.getElementById('rhet-invoice-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'rhet-invoice-print-frame'
  iframe.title = 'Stock request invoice print'
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })

  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    throw new Error('Unable to prepare the invoice print view. Try again.')
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.remove()
    }, 1000)
  }

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      frameWindow.focus()
      frameWindow.print()
    } catch {
      iframe.remove()
      throw new Error('Unable to open the print dialog. Try again.')
    } finally {
      cleanup()
    }
  }

  const waitForAssetsThenPrint = () => {
    const images = Array.from(frameDocument.images || [])
    if (images.length === 0) {
      setTimeout(triggerPrint, 50)
      return
    }
    let remaining = images.length
    const done = () => {
      remaining -= 1
      if (remaining <= 0) setTimeout(triggerPrint, 50)
    }
    images.forEach((img) => {
      if (img.complete) {
        done()
        return
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    setTimeout(triggerPrint, 1500)
  }

  iframe.onload = () => waitForAssetsThenPrint()
  setTimeout(waitForAssetsThenPrint, 400)
  return iframe
}
