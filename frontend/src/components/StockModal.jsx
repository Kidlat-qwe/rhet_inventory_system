import { useState } from 'react'

export function StockModal({ item, busy, close, adjust }) {
  const [kind, setKind] = useState('add')
  const [qty, setQty] = useState(1)
  const [remarks, setRemarks] = useState('')
  const nextStock = Math.max(0, item.stocks + (kind === 'add' ? Number(qty) : -Number(qty)))

  return (
    <div className="modal-backdrop">
      <form className="modal small" onSubmit={(e) => { e.preventDefault(); adjust(item, kind, qty, remarks) }}>
        <div className="modal-head">
          <div><h2>Update stock</h2><p>{item.itemName} · {item.stocks} currently available</p></div>
          <button type="button" onClick={close}>×</button>
        </div>
        <div className="toggle">
          <button type="button" className={kind === 'add' ? 'selected' : ''} onClick={() => setKind('add')}>＋ Add stock</button>
          <button type="button" className={kind === 'deduct' ? 'selected' : ''} onClick={() => setKind('deduct')}>− Deduct stock</button>
        </div>
        <label>Quantity<input type="number" min="1" max={kind === 'deduct' ? item.stocks : 999999} value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
        <label>Remarks<textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add transaction notes (optional)" /></label>
        <div className="stock-preview"><span>New stock quantity</span><strong>{nextStock}</strong></div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</button></div>
      </form>
    </div>
  )
}
