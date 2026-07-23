import { useEffect, useMemo, useState } from 'react'

// Client-side pagination for already-loaded lists. Slices `items` into pages of
// `pageSize` (default 15) and clamps the current page when the list shrinks
// (e.g. after filtering), so the view never lands on an empty page.
export function usePagination(items = [], pageSize = 15) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
  }, [totalPages])

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )

  return { page, setPage, pageItems, total, totalPages, pageSize }
}
