import type { NodeProps } from '@xyflow/react';

const GROUP_HEIGHT = 36;

function GroupNodeComponent({ data, selected }: NodeProps) {
  const d = data as any;
  const label = d.label || 'Group';
  const isCollapsed = d.isCollapsed as boolean;
  const memberCount = d.memberCount as number;

  return (
    <div
      className={`ch-tree-group ${selected ? 'active' : ''}`}
      style={{
        background: 'var(--ftb-surface-alt)',
        borderBottom: '1px solid var(--ftb-border)',
        height: GROUP_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span
        className="ch-tree-chevron"
        style={{
          display: 'inline-block',
          marginRight: 6,
          fontSize: 10,
          color: 'var(--ftb-accent)',
          transition: 'transform 0.15s',
          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
        }}
      >
        ▶
      </span>
      <span
        className="ch-tree-group-title"
        style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ftb-text-bright)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        className="ch-tree-group-count"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--ftb-bg)',
          background: 'var(--ftb-border)',
          padding: '0 6px',
          lineHeight: '16px',
          minWidth: 16,
          textAlign: 'center',
        }}
      >
        {memberCount}
      </span>
    </div>
  );
}

export { GroupNodeComponent, GROUP_HEIGHT };
