import * as XLSX from 'xlsx'
import { getAppTimezone } from './format'
import { branchDisplayName, normalizeBranchKey, requestItemLabel, requestSkuLabel, requestVariation } from './stockRequestChecklist'

const EXPORT_HEADERS = [
  'Request ID',
  'Batch reference',
  'External reference',
  'Branch',
  'Requested by',
  'Source system',
  'Item',
  'SKU',
  'Variation',
  'Category',
  'Quantity',
  'Internal price',
  'Amount',
  'Status',
  'Requested at',
  'Delivered at',
  'Delivery confirmed by',
  'Reason',
]

/** @typedef {'today' | 'date' | 'week' | 'month'} ExportPeriod */

/**
 * Calendar YYYY-MM-DD for a Date in the app timezone.
 * @param {Date|string|number} value
 * @param {string} [timeZone]
 */
export function dateKeyInTimezone(value, timeZone = getAppTimezone()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseYmd(ymd) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  }
}

function addDaysYmd(ymd, days) {
  const parts = parseYmd(ymd)
  if (!parts) return null
  const utc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days))
  return utc.toISOString().slice(0, 10)
}

/** Monday (ISO) for a calendar YYYY-MM-DD. */
function mondayOfYmd(ymd) {
  const parts = parseYmd(ymd)
  if (!parts) return null
  const utc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d))
  const day = utc.getUTCDay() // 0 Sun .. 6 Sat
  const offset = day === 0 ? -6 : 1 - day
  return addDaysYmd(ymd, offset)
}

/**
 * Unique branch options from stock requests (sorted by label).
 * @returns {{ key: string, label: string }[]}
 */
export function buildExportBranchOptions(requests = []) {
  const map = new Map()
  for (const request of requests) {
    const key = normalizeBranchKey(request.branchName)
    if (!map.has(key)) map.set(key, branchDisplayName(request.branchName))
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

/**
 * Resolve inclusive [startYmd, endYmd] for the selected export period.
 * @param {{ period: ExportPeriod, date?: string, week?: string, month?: string }} options
 * @param {Date} [now]
 */
export function resolveExportDateRange(options, now = new Date()) {
  const today = dateKeyInTimezone(now)
  const period = options?.period

  if (period === 'today') {
    return { startYmd: today, endYmd: today, label: `today-${today}` }
  }

  if (period === 'date') {
    const date = String(options.date || '').trim()
    if (!parseYmd(date)) {
      return { error: 'Choose a specific date.' }
    }
    return { startYmd: date, endYmd: date, label: `date-${date}` }
  }

  if (period === 'week') {
    const weekValue = String(options.week || '').trim()
    const weekMatch = weekValue.match(/^(\d{4})-W(\d{2})$/)
    if (weekMatch) {
      const year = Number(weekMatch[1])
      const week = Number(weekMatch[2])
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const jan4Day = jan4.getUTCDay() || 7
      const mondayWeek1 = new Date(jan4)
      mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
      const monday = new Date(mondayWeek1)
      monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7)
      const startYmd = monday.toISOString().slice(0, 10)
      const endYmd = addDaysYmd(startYmd, 6)
      return { startYmd, endYmd, label: `week-${weekValue}` }
    }
    const anchor = parseYmd(weekValue) ? weekValue : today
    const startYmd = mondayOfYmd(anchor)
    const endYmd = addDaysYmd(startYmd, 6)
    return { startYmd, endYmd, label: `week-${startYmd}_to_${endYmd}` }
  }

  if (period === 'month') {
    const monthValue = String(options.month || '').trim()
    const match = monthValue.match(/^(\d{4})-(\d{2})$/)
    if (!match) {
      return { error: 'Choose a month.' }
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const startYmd = `${match[1]}-${match[2]}-01`
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const endYmd = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`
    return { startYmd, endYmd, label: `month-${monthValue}` }
  }

  return { error: 'Choose an export period.' }
}

/**
 * Validate branch selection before period step / export.
 * @param {{ branchMode?: 'all' | 'selected', branchKeys?: string[] }} options
 * @param {{ key: string }[]} branchOptions
 */
export function resolveExportBranches(options, branchOptions = []) {
  const mode = options?.branchMode === 'selected' ? 'selected' : 'all'
  if (mode === 'all') {
    return {
      mode: 'all',
      keys: branchOptions.map((option) => option.key),
      label: 'all-branches',
    }
  }
  const selected = [...new Set((options.branchKeys || []).map(String).filter(Boolean))]
  if (!selected.length) {
    return { error: 'Select at least one branch, or choose All branches.' }
  }
  const allowed = new Set(branchOptions.map((option) => option.key))
  const keys = selected.filter((key) => allowed.has(key))
  if (!keys.length) {
    return { error: 'Select at least one valid branch.' }
  }
  const label = keys.length === 1
    ? `branch-${keys[0].replace(/[^\w.-]+/g, '_').slice(0, 40)}`
    : `branches-${keys.length}`
  return { mode: 'selected', keys, label }
}

/**
 * Delivered lines in date range, optionally limited to branch keys.
 */
export function filterDeliveredStockRequests(
  requests,
  startYmd,
  endYmd,
  {
    timeZone = getAppTimezone(),
    branchKeys = null,
  } = {},
) {
  const branchSet = Array.isArray(branchKeys) && branchKeys.length
    ? new Set(branchKeys)
    : null

  return (requests || []).filter((request) => {
    if (String(request?.status || '').toUpperCase() !== 'DELIVERED') return false
    if (branchSet && !branchSet.has(normalizeBranchKey(request.branchName))) return false
    const key = dateKeyInTimezone(request.deliveredAt, timeZone)
    if (!key) return false
    return key >= startYmd && key <= endYmd
  })
}

function formatExportDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function buildExportRow(request) {
  const qty = Number(request.quantity || 0)
  const price = Number(request.internalSellingPrice || 0)
  return [
    request.requestId,
    request.batchReference || '',
    request.externalReference || '',
    request.branchName || '',
    request.requestedBy || '',
    request.sourceSystem || '',
    requestItemLabel(request),
    requestSkuLabel(request),
    requestVariation(request) || '',
    request.categoryName || '',
    qty,
    price,
    qty * price,
    'DELIVERED',
    formatExportDate(request.createdAt || request.requestDate),
    formatExportDate(request.deliveredAt),
    request.deliveryConfirmedBy || '',
    request.reason || '',
  ]
}

const AMOUNT_COLUMN_INDEX = EXPORT_HEADERS.indexOf('Amount')

function buildExportWorksheet(rows) {
  const dataRows = rows.map(buildExportRow)
  const totalAmount = dataRows.reduce((sum, row) => sum + Number(row[AMOUNT_COLUMN_INDEX] || 0), 0)
  const totalRow = EXPORT_HEADERS.map((_, columnIndex) => {
    if (columnIndex === AMOUNT_COLUMN_INDEX - 1) return 'Total'
    if (columnIndex === AMOUNT_COLUMN_INDEX) return totalAmount
    return ''
  })
  const sheetRows = [EXPORT_HEADERS, ...dataRows, [], totalRow]
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
  worksheet['!cols'] = EXPORT_HEADERS.map((header, columnIndex) => {
    const maxCellLength = dataRows.reduce((max, row) => {
      const cell = String(row[columnIndex] ?? '')
      return Math.max(max, cell.length)
    }, Math.max(header.length, columnIndex === AMOUNT_COLUMN_INDEX - 1 ? 5 : 0))
    return { wch: Math.min(Math.max(maxCellLength + 2, 10), 48) }
  })
  return worksheet
}

/**
 * Build and download an XLSX workbook of delivered stock-request lines.
 * @returns {{ count: number, filename: string }}
 */
export function exportDeliveredStockRequests(requests, options = {}, branchOptions = []) {
  const branches = resolveExportBranches(options, branchOptions)
  if (branches.error) {
    const err = new Error(branches.error)
    err.code = 'VALIDATION'
    throw err
  }

  const range = resolveExportDateRange(options)
  if (range.error) {
    const err = new Error(range.error)
    err.code = 'VALIDATION'
    throw err
  }

  const rows = filterDeliveredStockRequests(requests, range.startYmd, range.endYmd, {
    branchKeys: branches.keys,
  })
  const filename = `stock-requests-delivered-${branches.label}-${range.label}.xlsx`
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, buildExportWorksheet(rows), 'Delivered')
  XLSX.writeFile(workbook, filename)

  return {
    count: rows.length,
    filename,
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    branchMode: branches.mode,
    branchCount: branches.keys.length,
  }
}

/** @deprecated Use exportDeliveredStockRequests — kept for backward compatibility. */
export const exportDeliveredStockRequestsCsv = exportDeliveredStockRequests

/** Default form values for the export modal. */
export function defaultStockRequestExportForm(now = new Date(), branchOptions = []) {
  const today = dateKeyInTimezone(now)
  const month = today.slice(0, 7)
  const monday = mondayOfYmd(today)
  const mondayParts = parseYmd(monday)
  let isoYear = today.slice(0, 4)
  let week = '01'
  if (mondayParts) {
    const thursday = addDaysYmd(monday, 3)
    isoYear = thursday.slice(0, 4)
    const jan4 = new Date(Date.UTC(Number(isoYear), 0, 4))
    const jan4Day = jan4.getUTCDay() || 7
    const mondayWeek1 = new Date(jan4)
    mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
    const thisMonday = new Date(Date.UTC(mondayParts.y, mondayParts.m - 1, mondayParts.d))
    const weekNum = Math.round((thisMonday - mondayWeek1) / (7 * 24 * 60 * 60 * 1000)) + 1
    week = String(Math.max(1, Math.min(53, weekNum))).padStart(2, '0')
  }
  return {
    branchMode: 'all',
    branchKeys: branchOptions.map((option) => option.key),
    period: 'today',
    date: today,
    week: `${isoYear}-W${week}`,
    month,
  }
}
