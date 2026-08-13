import { useState, useEffect, useRef, memo } from 'react';
import { CheckIcon } from '../ui/icons'
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { normalizeShape } from './quest-form-constants';
import { QuestTile } from './QuestTile';

const QuestNodeComponent = memo(function QuestNodeComponent({ data, selected }: NodeProps) {
  const d = data as any;
  // displayShape carries the EFFECTIVE shape (quest shape, else chapter
  // default — quests without a shape field inherit it in-game), set by
  // buildCanvasNodes. Fall back to the raw shape for safety.
  const shape = normalizeShape(d.displayShape || d.shape);
  const questColor = d.color as string | undefined;
  const label = d.label || 'Untitled Quest';
  const iconUrl = d.iconUrl as string | undefined;
  const hasIcon = d.icon as string;
  const smartFilter: string | undefined = d.smartFilter as string | undefined;
  const isOptional = d.optional as boolean;
  const pixelSize = d.pixelSize as { width: number; height: number } | undefined;
  const shapeTextures = d.shapeTextures as { background: string; outline: string; shape: string } | undefined;
  const nodeWidth = pixelSize?.width || 180;
  const nodeHeight = pixelSize?.height || 120;
  // FTB shape tiles are always square, so size the tile off the node's smaller
  // dimension regardless of the node box. The factor is calibrated against the
  // in-game render by the maintainer's eye (2026-08-12) — CALIBRATION IN
  // PROGRESS: every value from 0.8 to 1.8 read smaller than in-game; 1.8 still
  // reads "way too small compared to the icon". The dial continues at the next
  // session (2.0+ direction). The ICON does NOT scale with this factor: the
  // maintainer calibrated the icon separately (see QuestTile.iconBaseSize).
  const shapeSize = Math.max(16, Math.round(Math.min(nodeWidth, nodeHeight) * 1.8));
  // The icon anchors to the quest BODY (unscaled by the plate factor) so plate
  // growth never inflates the icon — s49-followup, calibrated 2026-08-12.
  const iconBaseSize = Math.max(16, Math.round(Math.min(nodeWidth, nodeHeight)));
  const iconScale =
    typeof d.icon_scaling === 'number' && Number.isFinite(d.icon_scaling)
      ? Math.min(2.0, Math.max(0.1, d.icon_scaling))
      : 1.0;
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const onRename = d.onRename as ((label: string) => void) | undefined;
  const renameNonce = (d.renameNonce as number) || 0;
  const nonceRef = useRef(0);

  const startRename = () => {
    if (!onRename) return;
    setRenameDraft(label);
    setRenaming(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };
  const commitRename = () => {
    if (!renaming) return;
    setRenaming(false);
    const value = renameDraft.trim();
    if (value && value !== label) onRename?.(value);
  };
  const cancelRename = () => setRenaming(false);

  useEffect(() => {
    if (renameNonce > 0 && renameNonce !== nonceRef.current) {
      nonceRef.current = renameNonce;
      startRename();
    }
  }, [renameNonce]);

  // Progress-simulation overlays (only present when "Simulate" mode is active).
  const simStatus = d.simStatus as { hidden: boolean; locked: boolean } | undefined;
  const simComplete = d.simComplete as boolean;
  const isSimHidden = simStatus?.hidden === true;
  const isSimLocked = !isSimHidden && simStatus?.locked === true;

  // Search-filter dimming/highlighting (only present when the search bar is active).
  const searchStatus = d.searchStatus as 'match' | 'dim' | undefined;
  const isSearchDim = searchStatus === 'dim';
  const isSearchMatch = searchStatus === 'match';

  const isLink = d.node_type === 'quest_link';
  const linkTarget = d.link_target as string | undefined;

  if (hasIcon && !iconUrl && process.env.NODE_ENV === 'development') {
    console.debug('[QuestNode] icon present but no iconUrl:', d.id, 'icon:', hasIcon);
  }

  return (
    <div
      className={`ftb-quest-node${selected ? ' selected' : ''}${isOptional ? ' optional' : ''}${isSimHidden ? ' sim-hidden' : ''}${isSimLocked ? ' sim-locked' : ''}${simComplete ? ' sim-complete' : ''}${isLink ? ' quest-link' : ''}${isSearchDim ? ' search-dim' : ''}${isSearchMatch ? ' search-match' : ''}`}
      style={{
        width: nodeWidth,
        height: nodeHeight,
      }}
    >
      {/* Dependency edges attach at the visible TILE center (not the node box
          center — the box also holds the title, so its center sits below the
          tile). Anchoring inside the tile wrap keeps lines perfectly
          center-to-center regardless of title length or quest scale. The
          handles are hidden except in connect mode, where the source handle
          becomes the port to drag a new dependency from. */}
      <QuestTile
        shape={shape}
        color={questColor}
        shapeTextures={shapeTextures}
        size={shapeSize}
        icon={hasIcon}
        iconUrl={iconUrl}
        iconScaling={iconScale}
        smartFilter={smartFilter}
        textureIndex={d.textureIndex || {}}
        iconBaseSize={iconBaseSize}
      >
        <Handle
          type="target"
          position={Position.Bottom}
          className="ftb-node-handle"
          id="tc"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="ftb-node-handle"
          id="c"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      </QuestTile>
      {renaming ? (
        <input
          ref={renameInputRef}
          className="ftb-quest-node-title-input"
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') cancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className="ftb-quest-node-title"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
          title={onRename ? 'Double-click to rename' : undefined}
        >
          {label}
        </div>
      )}
      {isLink && <div className="ftb-quest-link-badge" title={linkTarget ? `Links to quest ${linkTarget}` : 'Unlinked quest reference'}>{linkTarget ? `Link ${linkTarget}` : 'Link'}</div>}
      {isSimHidden && <div className="ftb-quest-sim-badge ftb-quest-sim-hidden" title="Hidden by visibility rules">Hidden</div>}
      {isSimLocked && <div className="ftb-quest-sim-badge ftb-quest-sim-locked" title="Requires missing dependencies">Locked</div>}
      {simComplete && <div className="ftb-quest-sim-badge ftb-quest-sim-done" title="Completed (simulated)"><CheckIcon size={10} /></div>}
    </div>
  );
});

export const nodeTypes = {
  quest: QuestNodeComponent,
};
