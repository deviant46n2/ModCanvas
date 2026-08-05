interface LeavePackModalProps {
  show: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function LeavePackModal({ show, onSave, onDiscard, onCancel }: LeavePackModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Unsaved Changes</h2>
        <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
          This pack has unsaved changes. Save them before leaving, discard them, or cancel to stay.
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onDiscard}>Discard</button>
          <button className="btn-primary" onClick={onSave}>Save &amp; Leave</button>
        </div>
      </div>
    </div>
  )
}
