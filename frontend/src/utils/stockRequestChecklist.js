/** Helpers for stock-request dispatch checklist / batch ship. */

export function requestVariation(request) {
  return [request?.gender, request?.itemType, request?.sizeLabel].filter(Boolean).join(' · ')
}

/** Primary label on checklist: item name, with category fallback. */
export function requestItemLabel(request) {
  const name = String(request?.itemName || '').trim()
  if (name) return name
  const variation = requestVariation(request)
  const category = String(request?.categoryName || '').trim()
  if (category && variation) return `${category} · ${variation}`
  return category || request?.matchedSku || 'Stock item'
}

export function requestSkuLabel(request) {
  return String(request?.matchedSku || '').trim() || '—'
}

export function componentItemLabel(component) {
  const name = String(component?.itemName || '').trim()
  if (name) return name
  const variation = [component?.gender, component?.itemType, component?.sizeLabel].filter(Boolean).join(' · ')
  const category = String(component?.categoryName || '').trim()
  if (category && variation) return `${category} · ${variation}`
  return category || component?.matchedSku || 'Component'
}

export function componentSkuLabel(component) {
  return String(component?.matchedSku || '').trim() || '—'
}

export function getStockIssue(request) {
  if (!request) return null

  const hasMatch = Boolean(request.matchedSku || request.inventoryId)
  const available = Number(request.currentStocks)
  const needed = Number(request.quantity) || 0

  if (!hasMatch) {
    return {
      code: 'UNMATCHED',
      title: 'Item not matched in inventory',
      message: 'This request does not match an inventory item yet. You cannot ship until it matches a stocked item.',
      available: null,
      canShip: false,
    }
  }

  if (!Number.isFinite(available)) {
    return {
      code: 'UNKNOWN_STOCK',
      title: 'Current stock unavailable',
      message: 'Unable to verify current warehouse stock for this item. Check Inventory before shipping.',
      available: null,
      canShip: false,
    }
  }

  if (available <= 0) {
    return {
      code: 'OUT_OF_STOCK',
      title: 'Out of stock',
      message: `This item is out of stock (0 available), but the request needs ${needed} unit(s).`,
      available,
      canShip: false,
    }
  }

  if (available < needed) {
    return {
      code: 'INSUFFICIENT',
      title: 'Insufficient stock',
      message: `Only ${available} unit(s) are available, but this request needs ${needed}.`,
      available,
      canShip: false,
    }
  }

  return null
}

export function canShipRequest(request) {
  if (String(request?.requestKind || '').toUpperCase() === 'RETURN') return false
  return request?.status === 'PENDING' && !getStockIssue(request)
}

export function normalizeBranchKey(branchName) {
  return String(branchName || '').trim().toLowerCase() || '__no_branch__'
}

export function branchDisplayName(branchName) {
  const name = String(branchName || '').trim()
  return name || 'No branch'
}

/** Format date/time in the configured org timezone (default Asia/Manila). */
export function formatManilaDateTime(value = new Date(), timeZone = 'Asia/Manila') {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: timeZone || 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

/** Format date only in the configured org timezone (default Asia/Manila). */
export function formatManilaDate(value = new Date(), timeZone = 'Asia/Manila') {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: timeZone || 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function uniqueRequesterNames(requests) {
  const names = []
  const seen = new Set()
  for (const request of requests || []) {
    const name = String(request?.requestedBy || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/**
 * Build printable HTML for a branch packing checklist.
 * Layout mirrors the stock-request invoice: stacked sections with breaks.
 * @param {{ branchName: string, requests: object[], printedBy?: string, printedAt?: Date, logoUrl?: string, organizationName?: string, timezone?: string }} options
 */
export function buildChecklistHtml({
  branchName,
  requests,
  printedBy = '',
  printedAt = new Date(),
  logoUrl = '',
  organizationName = 'RHET Inventory System',
  timezone = 'Asia/Manila',
}) {
  const branch = branchDisplayName(branchName)
  const when = formatManilaDateTime(printedAt, timezone)
  const dispatcherName = String(printedBy || '').trim() || '—'
  const requesterNames = uniqueRequesterNames(requests)
  const requesterDisplay = requesterNames.length ? requesterNames.join(', ') : '—'
  const brandName = String(organizationName || '').trim() || 'RHET Inventory System'
  const logoSrc = logoUrl
    || (typeof window !== 'undefined' ? `${window.location.origin}/rhet-logo.png` : '/rhet-logo.png')
  const refs = requests
    .map((request) => request.externalReference || request.requestId)
    .filter(Boolean)
    .join(', ')
  const lineCount = (requests || []).length

  const rows = requests.map((request, index) => {
    const issue = getStockIssue(request)
    const statusNote = issue ? `<span class="warn">${escapeHtml(issue.title)}</span>` : '<span class="ok">Ready</span>'
    const variation = requestVariation(request)
    const components = Array.isArray(request.components) ? request.components : []
    const componentRows = components.map((component) => `
      <tr class="component">
        <td></td>
        <td>
          <div class="item-sub">↳ ${escapeHtml(componentItemLabel(component))}</div>
        </td>
        <td class="sku">${escapeHtml(componentSkuLabel(component))}</td>
        <td class="num">${escapeHtml(String(component.quantity ?? ''))}</td>
        <td class="pick"><span class="pick-box"></span></td>
        <td class="status muted">Component</td>
      </tr>
    `).join('')

    return `
      <tr>
        <td class="idx">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(requestItemLabel(request))}</div>
          ${variation ? `<div class="item-sub">${escapeHtml(variation)}</div>` : ''}
        </td>
        <td class="sku">${escapeHtml(requestSkuLabel(request))}</td>
        <td class="num">${escapeHtml(String(request.quantity ?? ''))}</td>
        <td class="pick"><span class="pick-box"></span></td>
        <td class="status">${statusNote}</td>
      </tr>
      ${componentRows}
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Dispatch checklist — ${escapeHtml(branch)}</title>
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
    .doc { margin-top: 12px; text-align: left; }
    .doc h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: .02em;
      color: #15303f;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px 16px;
      margin-top: 14px;
    }
    .meta div span {
      display: block;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #8b93a0;
      margin-bottom: 3px;
    }
    .meta div strong {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #1a1f2a;
      word-break: break-word;
    }

    .dest {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #15303f;
      line-height: 1.35;
    }
    .dest-sub {
      margin: 6px 0 0;
      font-size: 11px;
      color: #5b6474;
    }

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
    table.lines td:nth-child(1) { width: 6%; text-align: left; padding-left: 0; }
    table.lines th:nth-child(2),
    table.lines td:nth-child(2) { width: 36%; text-align: left; }
    table.lines th:nth-child(3),
    table.lines td:nth-child(3) { width: 22%; text-align: left; }
    table.lines th:nth-child(4),
    table.lines td:nth-child(4) { width: 10%; text-align: right; }
    table.lines th:nth-child(5),
    table.lines td:nth-child(5) { width: 10%; text-align: center; }
    table.lines th:nth-child(6),
    table.lines td:nth-child(6) { width: 16%; text-align: left; padding-right: 0; }
    .item-name { font-weight: 600; font-size: 11px; }
    .item-sub { margin-top: 2px; font-size: 10px; color: #7a8494; }
    .sku { color: #5b6474; font-size: 10px; word-break: break-all; }
    .num {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      text-align: right;
      font-weight: 600;
    }
    .pick { text-align: center; }
    .pick-box {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 1.5px solid #5b6474;
      border-radius: 2px;
      vertical-align: middle;
    }
    .status { font-size: 10px; font-weight: 600; }
    .ok { color: #1f7a4c; }
    .warn { color: #a15c12; }
    .muted { color: #7a8494; font-weight: 500; }

    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 28px;
      align-items: start;
    }
    .sign { min-width: 0; }
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
      line-height: 1.35;
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
        grid-template-columns: 1fr 1fr 1fr !important;
        gap: 24px;
      }
      .signs .sign + .sign { margin-top: 0 !important; }
    }
    @media screen and (max-width: 720px) {
      .meta { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="sheet">

    <section class="section" aria-label="Checklist">
      <div class="brand">
        <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(brandName)} logo" />
        <div>
          <strong>${escapeHtml(brandName)}</strong>
          <span>Warehouse dispatch</span>
        </div>
      </div>
      <div class="doc">
        <h1>Dispatch checklist</h1>
      </div>
      <div class="meta">
        <div><span>Date &amp; time</span><strong>${escapeHtml(when)}</strong></div>
        <div><span>Lines</span><strong>${escapeHtml(String(lineCount))}</strong></div>
        <div><span>Reference</span><strong>${escapeHtml(refs || '—')}</strong></div>
        <div><span>Prepared by</span><strong>${escapeHtml(dispatcherName)}</strong></div>
      </div>
    </section>

    <hr class="break" />

    <section class="section" aria-label="Branch">
      <p class="label">Deliver to</p>
      <p class="dest">${escapeHtml(branch)}</p>
      <p class="dest-sub">Requested by ${escapeHtml(requesterDisplay)}</p>
    </section>

    <hr class="break" />

    <section class="section" aria-label="Items">
      <p class="label">Items to pick</p>
      <table class="lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Picked</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6">No lines</td></tr>'}
        </tbody>
      </table>
    </section>

    <hr class="break" />

    <section class="section" aria-label="Signatures">
      <div class="signs">
        <div class="sign">
          <strong>Warehouse / dispatcher</strong>
          <div class="name">${escapeHtml(dispatcherName)}</div>
          <div class="line">Signature / date</div>
        </div>
        <div class="sign">
          <strong>Courier / pickup</strong>
          <div class="name"></div>
          <div class="line">Print name and sign</div>
        </div>
        <div class="sign">
          <strong>Designated receiver</strong>
          <div class="name">${escapeHtml(requesterDisplay === '—' ? '' : requesterDisplay)}</div>
          <div class="line">Signature required for verification</div>
        </div>
      </div>
    </section>

    <p class="footnote">
      Soft copy for courier pickup. Warehouse stock is deducted only after Confirm ship in RHET Inventory.
      Courier and receiver sign on paper for handoff; system delivery is confirmed by the branch in CMS.
      Printed ${escapeHtml(when)}.
    </p>
  </div>
</body>
</html>`
}

/**
 * Print checklist without window.open (avoids pop-up blockers).
 * Uses a temporary hidden iframe in the current page.
 */
export function openChecklistPrintWindow(options) {
  const html = buildChecklistHtml(options)

  const existing = document.getElementById('rhet-dispatch-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'rhet-dispatch-print-frame'
  iframe.title = 'Dispatch checklist print'
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
    throw new Error('Unable to prepare the print view. Try again.')
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
    // Fallback if an image never settles.
    setTimeout(triggerPrint, 1500)
  }

  iframe.onload = () => waitForAssetsThenPrint()
  setTimeout(waitForAssetsThenPrint, 400)

  return iframe
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
