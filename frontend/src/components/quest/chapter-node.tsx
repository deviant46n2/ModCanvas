import { useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ArrowDownIcon, ArrowUpIcon, BookIcon, SettingsIcon } from '../ui/icons'
import { AnimatedSprite } from './AnimatedSprite'

export const CHAPTER_NODE_HEIGHT = 40

export function ChapterNodeComponent({ data }: NodeProps) {
  const d = data as any;
  const label = d.label || 'Untitled';
  const iconUrl = d.iconUrl as string | undefined;
  const iconKey = d.iconKey as string | undefined;
  const questCount = d.questCount as number;
  const isActive = d.isActive as boolean;
  const isAddButton = d.isAddButton as boolean;
  const onRename = d.onRename as ((label: string) => void) | undefined;
  const onEditChapter = d.onEditChapter as (() => void) | undefined;
  const onMoveChapter = d.onMoveChapter as ((dir: -1 | 1) => void) | undefined;
  const canMoveUp = d.canMoveUp === true;
  const canMoveDown = d.canMoveDown === true;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startRename = () => {
    if (!onRename) return;
    setDraft(label);
    setRenaming(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };
  const commitRename = () => {
    if (!renaming) return;
    setRenaming(false);
    const value = draft.trim();
    if (value && value !== label) onRename?.(value);
  };

  return (
    <div
      className={`ch-tree-chapter ${isActive ? 'active' : ''}`}
      style={{
        height: CHAPTER_NODE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px 0 12px',
        cursor: 'pointer',
        userSelect: 'none',
        borderLeft: isActive ? '3px solid var(--ftb-accent)' : '3px solid transparent',
        background: isActive ? 'var(--ftb-surface-alt)' : 'transparent',
        transition: 'background 0.1s, border-left-color 0.1s',
      }}
    >
      {isAddButton ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ftb-text-dim)' }}>
          <BookIcon size={14} />
          {label}
        </span>
      ) : (
        <>
          <span
            className="ch-tree-icon"
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              flexShrink: 0,
              background: 'var(--ftb-input-bg)',
              border: '1px solid var(--ftb-border)',
              imageRendering: 'pixelated',
            }}
          >
            {iconUrl ? (
              <AnimatedSprite url={iconUrl} textureKey={iconKey} width={16} height={16} alt="" style={{ objectFit: 'contain' }} />
            ) : (
              <BookIcon size={16} />
            )}
          </span>
          {renaming ? (
            <input
              ref={inputRef}
              className="ch-tree-rename-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="ch-tree-chapter-title"
              style={{
                flex: 1,
                fontSize: 11,
                fontWeight: 500,
                color: isActive ? 'var(--ftb-accent)' : 'var(--ftb-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={onRename ? 'Double-click to rename' : 'Double-click to edit chapter settings'}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
            >
              {label}
            </span>
          )}
          <span
            className="ch-tree-chapter-actions"
            style={{ display: 'flex', gap: 2, marginRight: 4, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {onMoveChapter && (
              <>
                <button
                  className="ch-tree-action-btn"
                  disabled={!canMoveUp}
                  onClick={() => onMoveChapter(-1)}
                  title="Move chapter up"
                >
                  <ArrowUpIcon size={12} />
                </button>
                <button
                  className="ch-tree-action-btn"
                  disabled={!canMoveDown}
                  onClick={() => onMoveChapter(1)}
                  title="Move chapter down"
                >
                  <ArrowDownIcon size={12} />
                </button>
              </>
            )}
            {onEditChapter && (
              <button className="ch-tree-action-btn" onClick={onEditChapter} title="Chapter settings">
                <SettingsIcon size={12} />
              </button>
            )}
          </span>
          <span
            className="ch-tree-chapter-count"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--ftb-bg)',
              background: isActive ? 'var(--ftb-accent)' : 'var(--ftb-border)',
              padding: '0 6px',
              lineHeight: '16px',
              minWidth: 16,
              textAlign: 'center',
            }}
          >
            {questCount}
          </span>
        </>
      )}
    </div>
  );
}
