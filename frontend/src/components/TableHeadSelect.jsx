import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Borderless table-header filter. The menu is portaled so overflow-x table
// wrappers do not clip it, and native <select> styling is avoided.
export function TableHeadSelect({
  value,
  options = [],
  onChange,
  ariaLabel = 'Filter',
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const selected = options.find((option) => option.value === value) || options[0]

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = 200
    let left = rect.left
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8
    }
    setCoords({ top: rect.bottom + 6, left: Math.max(8, left) })
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

  function choose(nextValue) {
    setOpen(false)
    if (nextValue !== value) onChange?.(nextValue)
  }

  return (
    <div className="table-head-select-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="table-head-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || 'Categories'}</span>
        <span className={`table-head-select-caret${open ? ' open' : ''}`} aria-hidden />
      </button>
      {open && createPortal(
        <>
          <button
            type="button"
            className="actions-menu-overlay"
            aria-label="Close category filter"
            onClick={() => setOpen(false)}
          />
          <div
            className="table-head-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
          >
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'is-selected' : undefined}
                  onClick={() => choose(option.value)}
                >
                  <span>{option.label}</span>
                  {isSelected && <span className="table-head-menu-check" aria-hidden>✓</span>}
                </button>
              )
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
