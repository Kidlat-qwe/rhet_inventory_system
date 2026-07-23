import { MovementTable } from '../../components/MovementTable'
import { Pagination } from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'

export default function StockMovementsPage({ movements }) {
  const { page, setPage, pageItems, total } = usePagination(movements, 15)

  return (
    <>
      <div className="page-title"><div><h1>Stock movements</h1><p>A complete audit trail of every inventory transaction.</p></div></div>
      <section className="panel recent">
        <MovementTable rows={pageItems} />
        <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="movements" />
      </section>
    </>
  )
}
