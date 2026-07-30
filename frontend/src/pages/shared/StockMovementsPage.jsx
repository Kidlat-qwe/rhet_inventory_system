import { MovementTable } from '../../components/MovementTable'
import { Pagination } from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'

export default function StockMovementsPage({ movements }) {
  const { page, setPage, pageItems, total } = usePagination(movements, 15)

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Stock movements</h1>
          <p>
            Warehouse audit trail (stock in/out, adjustments, PSMS/CMS releases).
            Shopee online-order sales and restores are under Merchandise releasing logs → Online orders.
          </p>
        </div>
      </div>
      <section className="panel recent">
        <MovementTable
          rows={pageItems}
          emptyMessage="Warehouse stock in/out and adjustments will appear here. Online order deductions are listed under Releasing logs."
        />
        <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} noun="movements" />
      </section>
    </>
  )
}
