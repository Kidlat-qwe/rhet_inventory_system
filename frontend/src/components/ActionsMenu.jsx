import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Reusable ellipsis (•••) actions menu. The dropdown is rendered in a portal
// with fixed positioning anchored to the trigger button, so it floats above
// the layout and is never clipped by scrolling table containers.
export function ActionsMenu({ label = 'Actions', items = [], disabled = false }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
  const buttonRef = useRef(null)

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
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

  const visibleItems = items.filter((item) => !item.hidden)

  return (
    <div className="actions-menu">
      <button
        ref={buttonRef}
        type="button"
        className="dots"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        •••
      </button>
      {open && createPortal(
        <>
          <button type="button" className="actions-menu-overlay" aria-label="Close actions menu" onClick={() => setOpen(false)} />
          <div className="actions-dropdown floating" role="menu" style={{ position: 'fixed', top: coords.top, right: coords.right }}>
            {visibleItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger-action' : undefined}
                disabled={item.disabled}
                title={item.title}
                onClick={() => { setOpen(false); item.onClick?.() }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
