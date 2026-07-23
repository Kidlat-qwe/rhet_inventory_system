import { useState } from 'react'

export function AllocationModal({ item, allocatedQty, busy, close, submit }) {
  const [kind, setKind] = useState('allocate')
  const [qty, setQty] = useState(1)
  const [remarks, setRemarks] = useState('')

  const maxQty = kind === 'allocate' ? item.stocks : allocatedQty
  const preview = kind === 'allocate'
    ? { rhet: Math.max(0, item.stocks - Number(qty || 0)), channel: allocatedQty + Number(qty || 0) }
    : { rhet: item.stocks + Number(qty || 0), channel: Math.max(0, allocatedQty - Number(qty || 0)) }

  return (
    <div className="modal-backdrop">
      <form className="modal small" onSubmit={(e) => { e.preventDefault(); submit(item, kind, qty, remarks) }}>
        <div className="modal-head">
          <div><h2>Shopee allocation</h2><p>{item.itemName} · {item.stocks} in RHET · {allocatedQty} allocated to Shopee</p></div>
          <button type="button" onClick={close}>×</button>
        </div>
        <div className="toggle">
          <button type="button" className={kind === 'allocate' ? 'selected' : ''} onClick={() => setKind('allocate')}>＋ Allocate to Shopee</button>
          <button type="button" className={kind === 'deallocate' ? 'selected' : ''} onClick={() => setKind('deallocate')}>− Deallocate back to RHET</button>
        </div>
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max={maxQty || undefined}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </label>
        {kind === 'deallocate' && allocatedQty === 0 && (
          <p className="field-hint">Nothing is currently allocated to Shopee for this item.</p>
        )}
        <label>Remarks<textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a note (optional)" /></label>
        <div className="stock-preview">
          <span>RHET stock after this action</span><strong>{preview.rhet}</strong>
        </div>
        <div className="stock-preview">
          <span>Shopee allocated qty after this action</span><strong>{preview.channel}</strong>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Cancel</button>
          <button className="primary" disabled={busy || (kind === 'deallocate' && allocatedQty === 0)}>
            {busy ? 'Saving…' : kind === 'allocate' ? 'Allocate to Shopee' : 'Deallocate from Shopee'}
          </button>
        </div>
      </form>
    </div>
  )
}
