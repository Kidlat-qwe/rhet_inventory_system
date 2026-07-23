const statusLabels = {
  ACTIVE: 'Active',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FULFILLED: 'Fulfilled',
  RECEIVED: 'Received',
  NEEDS_ATTENTION: 'Needs attention',
  MATCHED: 'Matched',
  DEDUCTED: 'Deducted',
  UNMATCHED: 'Unmatched',
  OVERSOLD: 'Oversold',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
  NOT_CONFIGURED: 'Not configured',
  CONFIGURED: 'Awaiting connection',
  CONNECTED: 'Connected',
  EXPIRED: 'Expired',
  ADMIN: 'Admin',
  USER: 'User',
  PROCESSING: 'Processing',
  READY_TO_SHIP: 'Ready to Ship',
  SHIPPED: 'Shipped',
  RETURN: 'Return',
  RETURN_CONFIRMED: 'Return Confirmed',
}

const movementLabels = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  ADJUSTMENT: 'Adjustment',
  RETURN: 'Return',
  DAMAGED: 'Damaged',
  RELEASED: 'Released',
  CANCELLED: 'Cancelled',
  ONLINE_SALE: 'Online sale',
  CHANNEL_ALLOCATION: 'Channel allocation',
}

export function formatStatus(status) {
  return statusLabels[status] || status?.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—'
}

export function formatMovementType(type) {
  return movementLabels[type] || type?.replaceAll('_', ' ') || '—'
}

export function formatCurrency(value) {
  const amount = Number(value) || 0
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function initials(name) {
  if (!name) return 'AD'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AD'
}

export function greetingName(name) {
  if (!name) return 'there'
  return name.split(/\s+/)[0]
}

// Normalize free-text inventory labels (item name / variation): lowercase and
// turn spaces into hyphens so values stay consistent for SKUs and matching.
export function normalizeInventoryText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function statusClass(status) {
  return formatStatus(status).toLowerCase().replaceAll(' ', '-')
}
