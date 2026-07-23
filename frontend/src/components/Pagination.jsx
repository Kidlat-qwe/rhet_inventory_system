// Presentational pager: "Showing X - Y of N noun" on the left, Previous / page
// indicator / Next on the right. Pair with the usePagination hook.
export function Pagination({ page, pageSize, total, onPageChange, noun = 'items' }) {
  if (!total) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="table-pagination">
      <span className="table-pagination-info">Showing {start} - {end} of {total} {noun}</span>
      <div className="table-pagination-controls">
        <button type="button" className="secondary small-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span className="table-pagination-page">Page {page} of {totalPages}</span>
        <button type="button" className="secondary small-btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
