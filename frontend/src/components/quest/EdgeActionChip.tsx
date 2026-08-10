import type { QuestEdgeData } from '../../services/quest-types'

interface EdgeActionChipProps {
  selectedEdge: QuestEdgeData
  edgeLabel: string
  bezierEditEdgeId: string | null
  editLocked: boolean
  onToggleBezier: () => void
  onResetBezier: () => void
  onDelete: () => void
}

/** Floating actions for a selected dependency edge (curve / reset / remove). */
export function EdgeActionChip({
  selectedEdge,
  edgeLabel,
  bezierEditEdgeId,
  editLocked,
  onToggleBezier,
  onResetBezier,
  onDelete,
}: EdgeActionChipProps) {
  return (
    <div className="edge-action-chip">
      <span className="edge-action-label">{edgeLabel}</span>
      {!editLocked && (
        <>
          <button
            className={`edge-action-ghost${bezierEditEdgeId === selectedEdge.id ? ' edge-action-active' : ''}`}
            onClick={onToggleBezier}
            title={bezierEditEdgeId === selectedEdge.id ? 'Hide curve control points' : 'Edit bezier control points of this arrow'}
          >
            {bezierEditEdgeId === selectedEdge.id ? 'Done' : 'Curve'}
          </button>
          {bezierEditEdgeId === selectedEdge.id && selectedEdge.bezier && (
            <button
              className="edge-action-ghost"
              onClick={onResetBezier}
              title="Reset this arrow to the default curve"
            >
              Reset
            </button>
          )}
          <button
            className="edge-action-delete"
            onClick={onDelete}
            title="Remove this dependency arrow (Del)"
          >
            Remove
          </button>
        </>
      )}
    </div>
  )
}

export default EdgeActionChip
