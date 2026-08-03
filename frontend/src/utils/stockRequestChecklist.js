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
  return request?.status === 'PENDING' && !getStockIssue(request)
}

export function normalizeBranchKey(branchName) {
  return String(branchName || '').trim().toLowerCase() || '__no_branch__'
}

export function branchDisplayName(branchName) {
  const name = String(branchName || '').trim()
  return name || 'No branch'
}

/** Format date/time in Philippine Standard Time (Asia/Manila, UTC+8). */
export function formatManilaDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

/** Format date only in Asia/Manila. */
export function formatManilaDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
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
 * @param {{ branchName: string, requests: object[], printedBy?: string, printedAt?: Date, logoUrl?: string }} options
 */
export function buildChecklistHtml({ branchName, requests, printedBy = '', printedAt = new Date(), logoUrl = '' }) {
  const branch = branchDisplayName(branchName)
  const when = formatManilaDateTime(printedAt)
  const dispatcherDate = formatManilaDate(printedAt)
  const dispatcherName = String(printedBy || '').trim() || '—'
  const requesterNames = uniqueRequesterNames(requests)
  const requesterDisplay = requesterNames.length ? requesterNames.join(', ') : '—'
  const logoSrc = logoUrl
    || (typeof window !== 'undefined' ? `${window.location.origin}/rhet-logo.png` : '/rhet-logo.png')
  const refs = requests
    .map((request) => request.externalReference || request.requestId)
    .filter(Boolean)
    .join(', ')

  const rows = requests.map((request, index) => {
    const issue = getStockIssue(request)
    const statusNote = issue ? `<span class="warn">${issue.title}</span>` : '<span class="ok">Ready</span>'
    const components = Array.isArray(request.components) ? request.components : []
    const componentRows = components.map((component) => `
      <tr class="component">
        <td></td>
        <td class="indent">↳ ${escapeHtml(componentItemLabel(component))}</td>
        <td>${escapeHtml(componentSkuLabel(component))}</td>
        <td class="qty">${escapeHtml(String(component.quantity ?? ''))}</td>
        <td class="pick"><span class="pick-box"></span></td>
        <td>Component</td>
      </tr>
    `).join('')

    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(requestItemLabel(request))}</strong></td>
        <td>${escapeHtml(requestSkuLabel(request))}</td>
        <td class="qty">${escapeHtml(String(request.quantity ?? ''))}</td>
        <td class="pick"><span class="pick-box"></span></td>
        <td>${statusNote}</td>
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
    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #172b54;
      margin: 0;
      padding: 28px 32px;
      font-size: 12px;
      background: #fff;
    }
    .sheet-head {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      border-bottom: 2px solid #172b54;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brand-block { display: flex; flex-direction: column; align-items: flex-start; }
    .brand-logo {
      display: block;
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: 50%;
      margin: 0 0 10px;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .brand-mark {
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #6d7788;
      margin: 0 0 4px;
    }
    h1 { font-size: 22px; margin: 0; color: #172b54; letter-spacing: -.3px; }
    .head-meta {
      text-align: right;
      font-size: 11px;
      color: #4a5565;
      line-height: 1.55;
      min-width: 220px;
    }
    .head-meta strong { color: #172b54; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 0 0 18px;
    }
    .summary div {
      border: 1px solid #e3e8ee;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .summary span {
      display: block;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: #8b93a0;
      margin-bottom: 4px;
    }
    .summary strong { font-size: 13px; color: #172b54; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d7dee6; padding: 10px 12px; text-align: left; vertical-align: top; }
    th {
      background: #172b54;
      color: #fff;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .45px;
      font-weight: 600;
    }
    td { font-size: 12px; }
    tr:nth-child(even) td { background: #fafbfc; }
    .qty { text-align: right; white-space: nowrap; font-weight: 700; }
    .pick {
      width: 54px;
      text-align: center;
    }
    .pick-box {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1.5px solid #4a5565;
      border-radius: 3px;
    }
    .indent { padding-left: 22px; color: #3a4556; font-size: 11px; }
    .ok { color: #1f7a4c; font-weight: 700; }
    .warn { color: #a15c12; font-weight: 700; }
    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 36px;
    }
    .sign-box {
      border: 1px solid #d7dee6;
      border-radius: 8px;
      padding: 12px 14px 16px;
      min-height: 110px;
    }
    .sign-box > strong {
      display: block;
      font-size: 12px;
      margin-bottom: 8px;
      color: #172b54;
    }
    .sign-on-line {
      margin-top: 28px;
      border-bottom: 1px solid #9aa3b2;
      text-align: center;
      padding: 0 8px 3px;
      min-height: 26px;
    }
    .sign-on-line .sign-value {
      display: inline-block;
      font-size: 13px;
      font-weight: 700;
      color: #172b54;
      line-height: 1.2;
    }
    .sign-meta {
      display: block;
      text-align: center;
      margin-top: 6px;
      font-size: 10px;
      color: #6d7788;
    }
    .sign-note {
      display: block;
      color: #6d7788;
      font-size: 10px;
      line-height: 1.45;
      margin-top: 10px;
    }
    .footnote {
      margin-top: 18px;
      color: #6d7788;
      font-size: 10px;
      line-height: 1.5;
      border-top: 1px solid #eef1f5;
      padding-top: 10px;
    }
    @media print {
      body { padding: 10mm 12mm; }
      .summary div { background: #fff; }
      th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet-head">
    <div class="brand-block">
      <img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="RHET logo" />
      <p class="brand-mark">RHET Inventory System</p>
      <h1>Dispatch checklist</h1>
    </div>
    <div class="head-meta">
      <div><strong>Printed (Asia/Manila)</strong><br/>${escapeHtml(when)}</div>
      ${printedBy ? `<div style="margin-top:8px"><strong>Printed by</strong><br/>${escapeHtml(printedBy)}</div>` : ''}
    </div>
  </div>
  <div class="summary">
    <div><span>Branch</span><strong>${escapeHtml(branch)}</strong></div>
    <div><span>Lines</span><strong>${requests.length}</strong></div>
    <div><span>References</span><strong>${escapeHtml(refs || '—')}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Item name</th>
        <th style="width:150px">SKU</th>
        <th style="width:56px">Qty</th>
        <th class="pick">Picked</th>
        <th style="width:100px">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="signs">
    <div class="sign-box">
      <strong>Warehouse / dispatcher</strong>
      <div class="sign-on-line">
        <span class="sign-value">${escapeHtml(dispatcherName)}</span>
      </div>
      <span class="sign-note">Signature</span>
    </div>
    <div class="sign-box">
      <strong>Designated receiver</strong>
      <div class="sign-on-line">
        <span class="sign-value">${escapeHtml(requesterDisplay)}</span>
      </div>
      <span class="sign-note">The requester’s signature is required for verification. Without a signature, the request will not be considered verified.</span>
    </div>
  </div>
  <p class="footnote">
    Soft copy for courier pickup. Warehouse stock is deducted only after Confirm ship in RHET Inventory.
    Paper receiver sign supports handoff; system delivery is confirmed by the branch in CMS.
  </p>
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
