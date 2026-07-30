import { useState, useEffect, useRef, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

const QuestNodeComponent = memo(function QuestNodeComponent({ data, selected }: NodeProps) {
  const d = data as any;
  const shape = (d.shape || 'Default').toLowerCase();
  const color = d.color || '#d4a843';
  const label = d.label || 'Untitled Quest';
  const iconUrl = d.iconUrl as string | undefined;
  const hasIcon = d.icon as string;
  const isOptional = d.optional as boolean;
  const [imgError, setImgError] = useState(false);

  const prevIconUrlRef = useRef(iconUrl);
  useEffect(() => {
    if (prevIconUrlRef.current !== iconUrl) {
      setImgError(false);
      prevIconUrlRef.current = iconUrl;
    }
  }, [iconUrl]);

  if (hasIcon && !iconUrl && process.env.NODE_ENV === 'development') {
    console.debug('[QuestNode] icon present but no iconUrl:', d.id, 'icon:', hasIcon);
  }

  return (
    <div
      className={`ftb-quest-node${selected ? ' selected' : ''}${isOptional ? ' optional' : ''}`}
      style={{
        width: 180,
        height: 120,
      }}
    >
      <Handle type="target" position={Position.Top} className="ftb-node-handle" />
      <div className={`ftb-quest-shape-wrap shape-${shape}`} style={{
        backgroundColor: `${color}22`,
        borderColor: color,
        width: 64,
        height: 64,
      }}>
        {hasIcon && (
          <div className="ftb-quest-node-icon">
            {iconUrl && !imgError ? (
              <img src={iconUrl} alt="" className="ftb-quest-node-icon-img" onError={() => setImgError(true)} />
            ) : (
              <span className="ftb-quest-node-icon-fallback">📜</span>
            )}
          </div>
        )}
      </div>
      <div className="ftb-quest-node-title">{label}</div>
      <Handle type="source" position={Position.Bottom} className="ftb-node-handle" />
    </div>
  );
});

export const nodeTypes = {
  quest: QuestNodeComponent,
};
