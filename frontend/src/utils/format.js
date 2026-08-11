const statusLabels = {
  ACTIVE: 'Active',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FULFILLED: 'Fulfilled',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
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
  ERROR: 'Error',
  INELIGIBLE: 'Ineligible',
  RETURN: 'Returned',
  RETURN_CONFIRMED: 'Returned',
}

/** Scoring Shipping Management–aligned labels for manual-order fulfillment. */
const manualFulfillmentLabels = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  ERROR: 'Error',
  INELIGIBLE: 'Ineligible',
  NEEDS_ATTENTION: 'Needs attention',
  RETURN: 'Return',
  RETURN_CONFIRMED: 'Return confirmed',
  RECEIVED: 'Delivered',
  CANCELLED: 'Error',
  READY_TO_SHIP: 'Processing',
}

export function formatManualFulfillmentStatus(status) {
  return manualFulfillmentLabels[status] || formatStatus(status)
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
  MANUAL_SALE: 'Manual sale',
  CHANNEL_ALLOCATION: 'Channel allocation',
}

export function formatStatus(status) {
  return statusLabels[status] || status?.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—'
}

/** Shopee-aligned labels for online-order fulfillment_status (board + badges). */
const onlineFulfillmentLabels = {
  PROCESSING: 'Unpaid',
  READY_TO_SHIP: 'To Ship',
  SHIPPED: 'Shipping',
  DELIVERED: 'Completed',
  RETURNED: 'Return/Refund',
  CANCELLED: 'Cancelled',
  RETURN: 'Return/Refund',
  RETURN_CONFIRMED: 'Return/Refund',
  RECEIVED: 'Completed',
}

export function formatOnlineFulfillmentStatus(status) {
  return onlineFulfillmentLabels[status] || formatStatus(status)
}


export function formatMovementType(type) {
  return movementLabels[type] || type?.replaceAll('_', ' ') || '—'
}

export function formatCurrency(value) {
  const amount = Number(value) || 0
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

let appTimezone = 'Asia/Manila'

export function setAppTimezone(timezone) {
  const next = String(timezone || '').trim()
  appTimezone = next || 'Asia/Manila'
}

export function getAppTimezone() {
  return appTimezone
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

  const timeOpts = { hour: 'numeric', minute: '2-digit', timeZone: appTimezone }
  const time = date.toLocaleTimeString(undefined, timeOpts)
  if (sameDay) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: appTimezone,
  })
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
// turn spaces into underscores so values stay consistent for SKUs and matching.
export function normalizeInventoryText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
}

/** Truncate long text for table cells; full value belongs in title/tooltip. */
export function truncateText(value = '', maxLength = 48) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function statusClass(status) {
  return formatStatus(status).toLowerCase().replaceAll(' ', '-')
}
