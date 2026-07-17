import { MovementTable } from '../../components/MovementTable'

export default function StockMovementsPage({ movements }) {
  return (
    <>
      <div className="page-title"><div><h1>Stock movements</h1><p>A complete audit trail of every inventory transaction.</p></div></div>
      <section className="panel recent"><MovementTable rows={movements} /></section>
    </>
  )
}
