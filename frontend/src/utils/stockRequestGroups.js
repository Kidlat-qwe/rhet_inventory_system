import { canShipRequest, requestItemLabel } from './stockRequestChecklist'

export function requestGroupKey(request) {
  const source = String(request?.sourceSystem || 'PSMS').trim() || 'PSMS'
  const kind = String(request?.requestKind || 'REQUEST').trim().toUpperCase() || 'REQUEST'
  const batch = String(request?.batchReference || '').trim()
  if (batch) return `${source}::${kind}::${batch}`
  return `solo::${kind}::${request?.requestId || ''}`
}

export function rollupGroupStatus(requests = []) {
  const statuses = new Set(requests.map((row) => String(row.status || '').toUpperCase()))
  if (statuses.size === 1) return [...statuses][0]
  if (statuses.has('PENDING')) return 'PARTIAL'
  if (statuses.has('SHIPPED')) return 'SHIPPED'
  if (statuses.has('DELIVERED')) return 'DELIVERED'
  if (statuses.has('RETURNED')) return 'RETURNED'
  if (statuses.has('REJECTED')) return 'REJECTED'
  return 'PENDING'
}

export function groupMatchesTab(group, filter) {
  const statuses = (group?.requests || []).map((row) => String(row.status || '').toUpperCase())
  if (!filter) return true
  if (filter === 'PENDING') return statuses.includes('PENDING')
  if (filter === 'SHIPPED') return statuses.includes('SHIPPED') && !statuses.includes('PENDING')
  if (filter === 'DELIVERED') {
    return statuses.includes('DELIVERED')
      && !statuses.includes('PENDING')
      && !statuses.includes('SHIPPED')
  }
  if (filter === 'RETURNED') {
    return statuses.includes('RETURNED')
      && !statuses.includes('PENDING')
      && !statuses.includes('SHIPPED')
  }
  if (filter === 'REJECTED') return statuses.every((status) => status === 'REJECTED')
  return true
}

/** Returned tab categories: All / Reusable / Not reusable. */
export function groupMatchesReturnOutcome(group, outcomeFilter) {
  if (!outcomeFilter || outcomeFilter === 'ALL') return true
  const returned = (group?.requests || []).filter((row) => String(row.status || '').toUpperCase() === 'RETURNED')
  if (outcomeFilter === 'REUSABLE') return returned.some((row) => row.returnReusable === true)
  if (outcomeFilter === 'NOT_REUSABLE') return returned.some((row) => row.returnReusable === false)
  return true
}

function uniqueItemLabels(requests) {
  const labels = []
  const seen = new Set()
  for (const request of requests || []) {
    const label = requestItemLabel(request)
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(label)
  }
  return labels
}

export function requestedGroupTotal(requests = []) {
  return requests.reduce((sum, request) => {
    if (String(request.status || '').toUpperCase() === 'REJECTED') return sum
    return sum + Number(request.quantity || 0) * Number(request.internalSellingPrice || 0)
  }, 0)
}

export function shipmentGroupTotal(requests = []) {
  return requests
    .filter((request) => canShipRequest(request))
    .reduce((sum, request) => sum + Number(request.quantity || 0) * Number(request.internalSellingPrice || 0), 0)
}

export function buildStockRequestGroups(requests = []) {
  const map = new Map()
  for (const request of requests) {
    const key = requestGroupKey(request)
    if (!map.has(key)) {
      map.set(key, {
        key,
        sourceSystem: request.sourceSystem || 'PSMS',
        requestKind: String(request.requestKind || 'REQUEST').toUpperCase() === 'RETURN' ? 'RETURN' : 'REQUEST',
        batchReference: request.batchReference || request.externalReference || request.requestId,
        branchName: request.branchName,
        requestedBy: request.requestedBy,
        reason: request.reason,
        createdAt: request.createdAt,
        requests: [],
      })
    }
    const group = map.get(key)
    group.requests.push(request)
    if (request.createdAt && new Date(request.createdAt) < new Date(group.createdAt || request.createdAt)) {
      group.createdAt = request.createdAt
    }
  }

  return [...map.values()]
    .map((group) => {
      const pending = group.requests.filter((row) => row.status === 'PENDING')
      const shipped = group.requests.filter((row) => row.status === 'SHIPPED')
      const delivered = group.requests.filter((row) => row.status === 'DELIVERED')
      const receivedTimes = group.requests
        .map((row) => row.deliveredAt)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
      const receivedByNames = [...new Set(
        group.requests
          .map((row) => String(row.deliveryConfirmedBy || '').trim())
          .filter(Boolean),
      )]
      return {
        ...group,
        lineCount: group.requests.length,
        totalQty: group.requests.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        pendingCount: pending.length,
        shippedCount: shipped.length,
        deliveredCount: delivered.length,
        returnedCount: group.requests.filter((row) => row.status === 'RETURNED').length,
        reusableCount: group.requests.filter((row) => row.status === 'RETURNED' && row.returnReusable === true).length,
        notReusableCount: group.requests.filter((row) => row.status === 'RETURNED' && row.returnReusable === false).length,
        shippableCount: pending.filter((row) => canShipRequest(row)).length,
        status: rollupGroupStatus(group.requests),
        requestedTotal: requestedGroupTotal(group.requests),
        shipmentTotal: shipmentGroupTotal(group.requests),
        receivedAt: receivedTimes.length
          ? new Date(Math.max(...receivedTimes.map((date) => date.getTime()))).toISOString()
          : null,
        receivedBy: receivedByNames.length ? receivedByNames.join(', ') : null,
        itemPreview: uniqueItemLabels(group.requests),
      }
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}
