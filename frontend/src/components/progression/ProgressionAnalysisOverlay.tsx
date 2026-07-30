import type { ProgressionAnalysis } from '../../services/api'

interface ProgressionAnalysisOverlayProps {
  analysis: ProgressionAnalysis
  onClose: () => void
}

export default function ProgressionAnalysisOverlay({ analysis, onClose }: ProgressionAnalysisOverlayProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal analysis-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Progression Analysis</h2>
        <div className="analysis-grid">
          <div className="analysis-stat">
            <div className="stat-value">{analysis.total_nodes}</div>
            <div className="stat-label">Nodes</div>
          </div>
          <div className="analysis-stat">
            <div className="stat-value">{analysis.total_edges}</div>
            <div className="stat-label">Connections</div>
          </div>
          <div className="analysis-stat">
            <div className="stat-value">{analysis.phases.length}</div>
            <div className="stat-label">Phases</div>
          </div>
          <div className="analysis-stat">
            <div className="stat-value">{analysis.coverage.total_mods}</div>
            <div className="stat-label">Mods Referenced</div>
          </div>
        </div>
        {analysis.issues.length > 0 && (
          <div className="analysis-issues">
            <h3>Issues</h3>
            {analysis.issues.map((issue, i) => (
              <div key={i} className={`issue-${issue.severity}`}>{issue.message}</div>
            ))}
          </div>
        )}
        {analysis.bottlenecks.length > 0 && (
          <div className="analysis-section">
            <h3>Bottlenecks</h3>
            {analysis.bottlenecks.map((b) => (
              <div key={b.node_id} className="bottleneck-item">
                <strong>{b.node_label}</strong> — {b.incoming_count} prerequisites
                <span className={`severity-${b.severity}`}>{b.severity}</span>
              </div>
            ))}
          </div>
        )}
        {analysis.dead_ends.length > 0 && (
          <div className="analysis-section">
            <h3>Dead Ends</h3>
            <p>{analysis.dead_ends.length} node(s) with no connections</p>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
