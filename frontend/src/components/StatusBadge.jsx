import { formatStatus, statusClass } from '../utils/format'

export function StatusBadge({ status }) {
  return <span className={`status ${statusClass(status)}`}><i />{formatStatus(status)}</span>
}
