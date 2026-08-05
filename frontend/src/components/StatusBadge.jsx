import { formatStatus, statusClass } from '../utils/format'

export function StatusBadge({ status, title, label }) {
  return (
    <span className={`status ${statusClass(status)}`} title={title}>
      <i />
      {label || formatStatus(status)}
    </span>
  )
}
