import { canShipRequest, requestItemLabel } from './stockRequestChecklist'

export function requestGroupKey(request) {
  const source = String(request?.sourceSystem || 'PSMS').trim() || 'PSMS'
  const batch = String(request?.batchReference || '').trim()
  if (batch) return `${source}::${batch}`
  return `solo::${request?.requestId || ''}`
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
      return {
        ...group,
        lineCount: group.requests.length,
        totalQty: group.requests.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        pendingCount: pending.length,
        shippedCount: shipped.length,
        deliveredCount: delivered.length,
        shippableCount: pending.filter((row) => canShipRequest(row)).length,
        status: rollupGroupStatus(group.requests),
        requestedTotal: requestedGroupTotal(group.requests),
        shipmentTotal: shipmentGroupTotal(group.requests),
        itemPreview: uniqueItemLabels(group.requests),
      }
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}
