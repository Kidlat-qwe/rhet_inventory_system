import { formatStatus, statusClass } from '../utils/format'

export function StatusBadge({ status, title }) {
  return (
    <span className={`status ${statusClass(status)}`} title={title}>
      <i />
      {formatStatus(status)}
    </span>
  )
}
