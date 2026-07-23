import { useState } from 'react'

export function StockModal({ item, busy, close, adjust }) {
  const [kind, setKind] = useState('add')
  const [qty, setQty] = useState(1)
  const [remarks, setRemarks] = useState('')

  const numericQty = Number(qty) || 0
  const nextStock = kind === 'adjust'
    ? Math.max(0, numericQty)
    : Math.max(0, item.stocks + (kind === 'add' ? numericQty : -numericQty))

  function selectKind(next) {
    setKind(next)
    setQty(next === 'adjust' ? item.stocks : 1)
  }

  return (
    <div className="modal-backdrop">
      <form className="modal small" onSubmit={(e) => { e.preventDefault(); adjust(item, kind, qty, remarks) }}>
        <div className="modal-head">
          <div><h2>Update stock</h2><p>{item.itemName} · {item.stocks} currently available</p></div>
          <button type="button" onClick={close}>×</button>
        </div>
        <div className="toggle">
          <button type="button" className={kind === 'add' ? 'selected' : ''} onClick={() => selectKind('add')}>＋ Add stock</button>
          <button type="button" className={kind === 'deduct' ? 'selected' : ''} onClick={() => selectKind('deduct')}>− Deduct stock</button>
          <button type="button" className={kind === 'adjust' ? 'selected' : ''} onClick={() => selectKind('adjust')}>⇄ Adjust</button>
        </div>
        <label>
          {kind === 'adjust' ? 'New stock quantity' : 'Quantity'}
          <input
            type="number"
            min={kind === 'adjust' ? 0 : 1}
            max={kind === 'deduct' ? item.stocks : 999999}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </label>
        <label>Remarks<textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add transaction notes (optional)" /></label>
        <div className="stock-preview"><span>New stock quantity</span><strong>{nextStock}</strong></div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</button></div>
      </form>
    </div>
  )
}
