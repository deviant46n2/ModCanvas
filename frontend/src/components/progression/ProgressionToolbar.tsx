interface ProgressionToolbarProps {
  selectedNodeType: string
  setSelectedNodeType: (type: string) => void
  onAddNode: () => void
  onAutoGenerate: () => void
  onVanillaTemplate: () => void
  onSave: () => void
  onAnalyze: () => void
}

export default function ProgressionToolbar({
  selectedNodeType, setSelectedNodeType, onAddNode,
  onAutoGenerate, onVanillaTemplate, onSave, onAnalyze,
}: ProgressionToolbarProps) {
  return (
    <div className="progression-toolbar">
      <div className="toolbar-section">
        <h3>Progression Graph</h3>
      </div>
      <div className="toolbar-actions">
        <div className="node-type-selector">
          <label>Type:</label>
          <select value={selectedNodeType} onChange={(e) => setSelectedNodeType(e.target.value)}>
            <option value="milestone">Milestone</option>
            <option value="unlock">Unlock</option>
            <option value="phase">Phase</option>
            <option value="achievement">Achievement</option>
            <option value="content">Content</option>
          </select>
        </div>
        <button className="btn-primary" onClick={onAddNode}>+ Add</button>
        <button className="btn-success" onClick={onVanillaTemplate}>Vanilla Template</button>
        <button className="btn-secondary" onClick={onAutoGenerate}>Load from Pack</button>
        <button className="btn-secondary" onClick={onSave}>Save</button>
        <button className="btn-secondary" onClick={onAnalyze}>Analyze</button>
      </div>
    </div>
  )
}
