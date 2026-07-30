import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { validateQuestGraph } from '../../core/validation/quest-validator';

export interface ValidationOverlayProps {
  nodes: Node[];
  edges: Edge[];
  isActive: boolean;
}

export function ValidationOverlay({ nodes, edges, isActive }: ValidationOverlayProps) {
  const issues = useMemo(() => {
    if (!isActive) return [];
    return validateQuestGraph({
      nodes: nodes.map(n => ({
        id: n.id,
        dependencies: [],
      })),
      edges: edges.map(e => ({
        source: e.source,
        target: e.target,
      })),
    });
  }, [nodes, edges, isActive]);

  return (
    <div
      className="validation-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {isActive && issues.length > 0 && (
        <div
          className="validation-panel"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            maxWidth: 300,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4, color: issues.some(i => i.severity === 'error') ? '#EF5350' : '#FFA726' }}>
            {issues.filter(i => i.severity === 'error').length} error(s), {issues.filter(i => i.severity === 'warning').length} warning(s)
          </div>
          {issues.slice(0, 5).map((issue, i) => (
            <div
              key={i}
              style={{
                color: issue.severity === 'error' ? '#EF5350' : '#FFA726',
                padding: '2px 0',
                borderBottom: i < Math.min(issues.length, 5) - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}
            >
              {issue.message}
            </div>
          ))}
          {issues.length > 5 && (
            <div style={{ color: '#888', paddingTop: 2 }}>...{issues.length - 5} more</div>
          )}
        </div>
      )}
    </div>
  );
}


