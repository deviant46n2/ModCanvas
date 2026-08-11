interface EdgeActionChipProps {
  edgeLabel: string
  editLocked: boolean
  onDelete: () => void
}

/** Floating actions for a selected dependency edge (remove). */
export function EdgeActionChip({
  edgeLabel,
  editLocked,
  onDelete,
}: EdgeActionChipProps) {
  return (
    <div className="edge-action-chip">
      <span className="edge-action-label">{edgeLabel}</span>
      {!editLocked && (
        <button
          className="edge-action-delete"
          onClick={onDelete}
          title="Remove this dependency arrow (Del)"
        >
          Remove
        </button>
      )}
    </div>
  )
}

export default EdgeActionChip
