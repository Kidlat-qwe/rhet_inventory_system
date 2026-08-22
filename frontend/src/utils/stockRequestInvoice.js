import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { formatManilaDateTime } from './stockRequestChecklist'

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
  const invoiceDateTime = formatManilaDateTime(invoice?.createdAt || printedAt, timezone)
  const invoiceNumber = invoice?.invoiceNumber || 'DRAFT'
  const isDraft = Boolean(invoice?.draft) || !invoice?.invoiceNumber
  const lines = invoiceLines(invoice)
  const subtotal = Number(invoice?.subtotal ?? lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0))
  const dispatcherName = String(printedBy || invoice?.createdByName || '').trim() || '—'
  const shipmentLabel = `${invoice?.shipmentSeq || 1}`
  const reference = invoice?.batchReference || '—'
  const branchName = invoice?.branchName || '—'
  const requestedBy = invoice?.requestedBy || '—'
  const remarks = String(invoice?.reason || '').trim()

  const rows = lines.map((line) => {
    const title = line.itemName || line.categoryName || 'Item'
    const subtitleParts = []
    if (line.variation) subtitleParts.push(line.variation)
    if (line.categoryName && line.itemName) subtitleParts.push(line.categoryName)
    const subtitle = subtitleParts.join(' · ')
    return `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="item-sub">${escapeHtml(subtitle)}</div>` : ''}
      </td>
      <td class="sku">${escapeHtml(line.sku || '—')}</td>
      <td class="num">${escapeHtml(String(line.quantity ?? ''))}</td>
      <td class="num">${escapeHtml(formatInvoiceMoney(line.unitPrice))}</td>
      <td class="num">${escapeHtml(formatInvoiceMoney(line.lineTotal))}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 14mm 14mm 16mm; }
    body {
      margin: 0;
      padding: 0;
      color: #1a1f2a;
      background: #fff;
      font-family: "Segoe UI", system-ui, -apple-system, Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.45;
    }
    .sheet { max-width: 720px; margin: 0 auto; }

    .section { padding: 14px 0; }
    .section:first-child { padding-top: 0; }
    .break {
      border: 0;
      border-top: 1px solid #d8dde6;
      margin: 0;
    }
    .label {
      margin: 0 0 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #8b93a0;
    }

    /* 1) Invoice + INV-SR under brand */
    .invoice-head {
      display: block;
    }
    .brand {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }
    .brand img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid #e6ebf2;
      flex-shrink: 0;
    }
    .brand strong {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #15303f;
    }
    .brand span {
      display: block;
      margin-top: 2px;
      font-size: 10px;
      color: #7a8494;
    }
    .doc {
      margin-top: 12px;
      text-align: left;
    }
    .doc h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #15303f;
    }
    .doc .no {
      margin-top: 4px;
      font-size: 13px;
      font-weight: 700;
      color: #1a1f2a;
    }
    .badge {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 7px;
      border: 1px solid #c9a06a;
      border-radius: 3px;
      color: #8a5b16;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .invoice-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px 16px;
      margin-top: 14px;
    }
    .invoice-meta div span {
      display: block;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #8b93a0;
      margin-bottom: 3px;
    }
    .invoice-meta div strong {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #1a1f2a;
      word-break: break-word;
    }

    /* 2) Bill to */
    .bill-to {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #15303f;
      line-height: 1.35;
    }
    .bill-sub {
      margin: 6px 0 0;
      font-size: 11px;
      color: #5b6474;
    }

    /* 3) Description */
    table.lines {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.lines th,
    table.lines td {
      border: 0;
      padding: 8px 8px;
      vertical-align: top;
      background: transparent;
    }
    table.lines thead th {
      padding-top: 0;
      padding-bottom: 7px;
      border-bottom: 1px solid #1a1f2a;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #7a8494;
    }
    table.lines tbody td {
      border-bottom: 1px solid #eef0f3;
      color: #1a1f2a;
    }
    table.lines th:nth-child(1),
    table.lines td:nth-child(1) {
      width: 34%;
      text-align: left;
      padding-left: 0;
    }
    table.lines th:nth-child(2),
    table.lines td:nth-child(2) {
      width: 24%;
      text-align: left;
    }
    table.lines th:nth-child(3),
    table.lines td:nth-child(3) {
      width: 10%;
      text-align: right;
    }
    table.lines th:nth-child(4),
    table.lines td:nth-child(4) {
      width: 16%;
      text-align: right;
    }
    table.lines th:nth-child(5),
    table.lines td:nth-child(5) {
      width: 16%;
      text-align: right;
      padding-right: 0;
    }
    .item-name { font-weight: 600; font-size: 11px; }
    .item-sub { margin-top: 2px; font-size: 10px; color: #7a8494; }
    .sku { color: #5b6474; font-size: 10px; word-break: break-all; }
    .num {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .totals {
      margin-top: 10px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box { width: 220px; }
    .totals-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 4px 0;
      font-size: 11px;
      color: #5b6474;
    }
    .totals-row.grand {
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px solid #1a1f2a;
      font-size: 13px;
      font-weight: 700;
      color: #15303f;
    }
    .price-note {
      margin-top: 4px;
      text-align: right;
      font-size: 9px;
      color: #8b93a0;
    }

    /* 4) Remarks */
    .remarks p {
      margin: 0;
      font-size: 11px;
      color: #3a4454;
      white-space: pre-wrap;
    }
    .remarks .empty {
      color: #8b93a0;
      font-style: italic;
    }

    /* 5) Authorized / Acknowledged — always side by side on print */
    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: start;
    }
    .sign {
      min-width: 0;
    }
    .sign strong {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: #5b6474;
      margin-bottom: 10px;
    }
    .sign .name {
      min-height: 16px;
      font-size: 12px;
      font-weight: 600;
      color: #1a1f2a;
      margin-bottom: 22px;
    }
    .sign .line {
      border-top: 1px solid #c5ccd6;
      padding-top: 6px;
      font-size: 9px;
      color: #8b93a0;
    }

    .footnote {
      margin-top: 8px;
      padding-top: 12px;
      font-size: 9px;
      color: #8b93a0;
      line-height: 1.5;
    }

    @media print {
      body { padding: 0; }
      .signs {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 40px;
      }
      .signs .sign + .sign { margin-top: 0 !important; }
    }
    @media screen and (max-width: 720px) {
      .invoice-meta { grid-template-columns: 1fr 1fr; }
      .totals { justify-content: stretch; }
      .totals-box { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="sheet">

    <section class="section" aria-label="Invoice">
      <div class="invoice-head">
        <div class="brand">
          <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(brandName)} logo" />
          <div>
            <strong>${escapeHtml(brandName)}</strong>
            <span>Internal branch restock</span>
          </div>
        </div>
        <div class="doc">
          <h1>INVOICE</h1>
          <div class="no">${escapeHtml(invoiceNumber)}</div>
          ${isDraft ? '<span class="badge">Draft</span>' : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div><span>Date &amp; time</span><strong>${escapeHtml(invoiceDateTime)}</strong></div>
        <div><span>Shipment</span><strong>${escapeHtml(shipmentLabel)}</strong></div>
        <div><span>Reference</span><strong>${escapeHtml(reference)}</strong></div>
        <div><span>Prepared by</span><strong>${escapeHtml(dispatcherName)}</strong></div>
      </div>
    </section>

    <hr class="break" />

    <section class="section" aria-label="Bill to">
      <p class="label">Bill to</p>
      <p class="bill-to">${escapeHtml(branchName)}</p>
      <p class="bill-sub">Requested by ${escapeHtml(requestedBy)}</p>
    </section>

    <hr class="break" />

    <section class="section" aria-label="Description">
      <p class="label">Description</p>
      <table class="lines">
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5">No shippable lines</td></tr>'}
        </tbody>
      </table>
      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>${escapeHtml(formatInvoiceMoney(subtotal))}</span></div>
          <div class="totals-row grand"><span>Total</span><span>${escapeHtml(formatInvoiceMoney(subtotal))}</span></div>
          <div class="price-note">Internal selling price · PHP</div>
        </div>
      </div>
    </section>

    <hr class="break" />

    <section class="section remarks" aria-label="Remarks">
      <p class="label">Remarks</p>
      ${remarks
    ? `<p>${escapeHtml(remarks)}</p>`
    : '<p class="empty">No remarks</p>'}
    </section>

    <hr class="break" />

    <section class="section" aria-label="Authorization">
      <div class="signs">
        <div class="sign">
          <strong>Authorized by (warehouse)</strong>
          <div class="name">${escapeHtml(dispatcherName)}</div>
          <div class="line">Signature / date</div>
        </div>
        <div class="sign">
          <strong>Acknowledged by (branch)</strong>
          <div class="name">${escapeHtml(requestedBy === '—' ? '' : requestedBy)}</div>
          <div class="line">Signature / date</div>
        </div>
      </div>
    </section>

    <p class="footnote">
      Covers goods in this shipment only. Remaining pending lines stay on the same request and appear on a later invoice if shipped.
      Printed ${escapeHtml(when)}.
    </p>
  </div>
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

function waitForDocumentImages(doc, timeoutMs = 4000) {
  const images = Array.from(doc.images || [])
  if (!images.length) return Promise.resolve()
  return new Promise((resolve) => {
    let remaining = images.length
    let settled = false
    const done = () => {
      remaining -= 1
      if (remaining <= 0 && !settled) {
        settled = true
        resolve()
      }
    }
    images.forEach((img) => {
      if (img.complete) {
        done()
        return
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    setTimeout(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    }, timeoutMs)
  })
}

/**
 * Build an invoice PDF Blob from the same HTML layout used for print,
 * so Download invoice matches the on-screen / print invoice design.
 */
export async function buildInvoicePdfBlob(options = {}) {
  const html = buildInvoiceHtml(options)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'Invoice PDF render'
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: '794px',
    height: '1123px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(iframe)

  try {
    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!frameDoc) throw new Error('Unable to prepare the invoice for PDF download.')

    frameDoc.open()
    frameDoc.write(html)
    frameDoc.close()

    await waitForDocumentImages(frameDoc)

    const sheet = frameDoc.querySelector('.sheet')
    if (!sheet) throw new Error('Invoice layout was not found.')

    // Match print sheet width so the capture looks like the first (HTML) invoice.
    sheet.style.width = '720px'
    sheet.style.maxWidth = '720px'
    sheet.style.padding = '24px 28px'
    sheet.style.boxSizing = 'border-box'
    sheet.style.background = '#ffffff'

    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 4000,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const imageData = canvas.toDataURL('image/png')

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pageHeight

    while (heightLeft > 1) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
      heightLeft -= pageHeight
    }

    return pdf.output('blob')
  } finally {
    iframe.remove()
  }
}

/**
 * Open the invoice as a PDF blob in a new tab (native browser PDF viewer).
 * Layout matches the HTML invoice used for print.
 * Pass an already-opened window from a synchronous click so pop-up blockers allow it.
 */
export async function openInvoiceInNewTab(options, targetWindow = null) {
  const blob = await buildInvoicePdfBlob(options)
  const url = URL.createObjectURL(blob)
  const tab = targetWindow || window.open(url, '_blank')
  if (!tab) {
    URL.revokeObjectURL(url)
    throw new Error('Pop-up blocked. Allow pop-ups for this site to open invoices in a new tab.')
  }
  try {
    tab.location.href = url
    tab.focus()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('Unable to open the invoice PDF in a new tab.')
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000)
  return tab
}
