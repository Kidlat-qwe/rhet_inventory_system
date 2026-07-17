export function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-message">{message}</p>
      {action}
    </div>
  )
}
