import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'

const ConfirmContext = createContext(null)

const DEFAULT_OPTIONS = {
  title: 'Please confirm',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolverRef = useRef(null)

  const close = useCallback((confirmed) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    if (resolve) resolve(Boolean(confirmed))
  }, [])

  const confirm = useCallback((options = {}) => {
    if (resolverRef.current) resolverRef.current(false)
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({ ...DEFAULT_OPTIONS, ...options })
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={Boolean(dialog)}
        title={dialog?.title}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        danger={Boolean(dialog?.danger)}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return context.confirm
}
