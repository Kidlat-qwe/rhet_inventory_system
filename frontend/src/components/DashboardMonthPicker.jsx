import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parsePeriodKey(value, now = new Date()) {
  if (!value || value === 'year') {
    return { mode: 'year', year: now.getFullYear(), month: null }
  }
  const match = String(value).match(/^(\d{4})-(\d{2})$/)
  if (!match) return { mode: 'year', year: now.getFullYear(), month: null }
  return {
    mode: 'month',
    year: Number(match[1]),
    month: Number(match[2]),
  }
}

function formatPeriodLabel(value, now = new Date()) {
  const parsed = parsePeriodKey(value, now)
  if (parsed.mode === 'year') return `This year (${parsed.year})`
  return `${MONTH_LONG[parsed.month - 1]} ${parsed.year}`
}

/**
 * Month picker for the dashboard period filter.
 * Default selection is the full year; picking a month sets YYYY-MM.
 */
export function DashboardMonthPicker({
  value = 'year',
  onChange,
  disabled = false,
  now = new Date(),
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const selected = useMemo(() => parsePeriodKey(value, now), [value, now])
  const [viewYear, setViewYear] = useState(selected.year || currentYear)

  useEffect(() => {
    if (open) setViewYear(selected.year || currentYear)
  }, [open, selected.year, currentYear])

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = 280
    let left = rect.right - menuWidth
    if (left < 8) left = 8
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8
    }
    setCoords({ top: rect.bottom + 6, left })
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function chooseYear() {
    onChange?.('year')
    setOpen(false)
  }

  function chooseMonth(month) {
    const next = `${viewYear}-${String(month).padStart(2, '0')}`
    onChange?.(next)
    setOpen(false)
  }

  const canGoNextYear = viewYear < currentYear
  const canGoPrevYear = viewYear > currentYear - 5
  const label = formatPeriodLabel(value, now)

  return (
    <div className="dashboard-month-picker">
      <span className="dashboard-month-picker-label">Period</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dashboard-month-picker-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose dashboard period"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{label}</span>
        <span className="dashboard-month-picker-caret" aria-hidden="true">▾</span>
      </button>

      {open && createPortal(
        <>
          <button
            type="button"
            className="actions-menu-overlay"
            aria-label="Close period picker"
            onClick={() => setOpen(false)}
          />
          <div
            className="dashboard-month-picker-menu"
            role="dialog"
            aria-label="Month picker"
            style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 1000 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dashboard-month-picker-year-row">
              <button
                type="button"
                className="dashboard-month-picker-year-btn"
                aria-label="Previous year"
                disabled={!canGoPrevYear}
                onClick={() => setViewYear((year) => year - 1)}
              >
                ‹
              </button>
              <strong>{viewYear}</strong>
              <button
                type="button"
                className="dashboard-month-picker-year-btn"
                aria-label="Next year"
                disabled={!canGoNextYear}
                onClick={() => setViewYear((year) => year + 1)}
              >
                ›
              </button>
            </div>

            <button
              type="button"
              className={`dashboard-month-picker-year-option${selected.mode === 'year' ? ' is-selected' : ''}`}
              onClick={chooseYear}
            >
              This year ({currentYear})
            </button>

            <div className="dashboard-month-picker-grid" role="listbox" aria-label="Months">
              {MONTH_SHORT.map((name, index) => {
                const month = index + 1
                const isFuture = viewYear > currentYear
                  || (viewYear === currentYear && month > currentMonth)
                const isSelected = selected.mode === 'month'
                  && selected.year === viewYear
                  && selected.month === month
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`dashboard-month-picker-month${isSelected ? ' is-selected' : ''}`}
                    disabled={isFuture}
                    onClick={() => chooseMonth(month)}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
