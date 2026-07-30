import type { Node } from '@xyflow/react'
import type { ProgressionGraphData } from '../../services/api'

interface ProgressionNodeInspectorProps {
  selectedNode: Node
  graph: ProgressionGraphData | null
  editLabel: string
  editDesc: string
  editPhase: string
  editStageName: string
  editColor: string
  editIcon: string
  modRefs: string[]
  onSetEditLabel: (v: string) => void
  onSetEditDesc: (v: string) => void
  onSetEditPhase: (v: string) => void
  onSetEditStageName: (v: string) => void
  onSetEditColor: (v: string) => void
  onSetEditIcon: (v: string) => void
  onClose: () => void
  onApply: () => void
  onDelete: () => void
}

export default function ProgressionNodeInspector({
  graph, editLabel, editDesc, editPhase, editStageName,
  editColor, editIcon, modRefs,
  onSetEditLabel, onSetEditDesc, onSetEditPhase, onSetEditStageName,
  onSetEditColor, onSetEditIcon, onClose, onApply, onDelete,
}: ProgressionNodeInspectorProps) {
  return (
    <div className="progression-inspector">
      <div className="inspector-header">
        <h4>Edit Node</h4>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>
      <div className="inspector-body">
        <div className="inspector-field">
          <label>Label</label>
          <input type="text" value={editLabel}
            onChange={(e) => onSetEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
          />
        </div>
        <div className="inspector-field">
          <label>Description</label>
          <textarea value={editDesc} onChange={(e) => onSetEditDesc(e.target.value)} rows={3} />
        </div>
        <div className="inspector-row">
          <div className="inspector-field half">
            <label>Phase</label>
            <input type="text" value={editPhase} onChange={(e) => onSetEditPhase(e.target.value)} placeholder="Early Game" />
          </div>
          <div className="inspector-field half">
            <label>Stage Name</label>
            <input type="text" value={editStageName} onChange={(e) => onSetEditStageName(e.target.value)} />
          </div>
        </div>
        <div className="inspector-row">
          <div className="inspector-field half">
            <label>Color (hex)</label>
            <input type="color" value={editColor || '#3b82f6'} onChange={(e) => onSetEditColor(e.target.value)} />
          </div>
          <div className="inspector-field half">
            <label>Icon (item id)</label>
            <input type="text" value={editIcon} onChange={(e) => onSetEditIcon(e.target.value)} placeholder="minecraft:nether_star" />
          </div>
        </div>
        {modRefs.length > 0 && (
          <div className="inspector-field">
            <label>Linked Mods</label>
            <div className="inspector-mods">
              {modRefs.map((modId, i) => {
                const displayName = graph?.mod_names?.[modId] || modId
                return <span key={i} className="mod-tag" title={modId}>{displayName}</span>
              })}
            </div>
          </div>
        )}
        <div className="inspector-actions">
          <button className="btn-primary" onClick={onApply}>Apply</button>
          <button className="btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  )
}
