import { useState, useEffect, useRef, memo } from 'react';
import { BookIcon, CheckIcon } from '../ui/icons'
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useMcTheme } from '../theme/theme-context';
import { normalizeShape } from './quest-form-constants';
import { AnimatedSprite } from './AnimatedSprite';
import { bakeShapeTile } from '../../services/shape-textures';
import { SmartFilterIcon } from './SmartFilterIcon';

// Fallback shape plate (only when the instance's real shape textures are not
// available): a dark tile like the in-game quest book's, instead of a light one.
const SHAPE_PLATE_GREY = 'rgba(45, 50, 60, 0.85)';
const SHAPE_OUTLINE_GREY = '#9aa3b2';

const QuestNodeComponent = memo(function QuestNodeComponent({ data, selected }: NodeProps) {
  const d = data as any;
  // displayShape carries the EFFECTIVE shape (quest shape, else chapter
  // default — quests without a shape field inherit it in-game), set by
  // buildCanvasNodes. Fall back to the raw shape for safety.
  const shape = normalizeShape(d.displayShape || d.shape);
  const questColor = d.color as string | undefined;
  const hasQuestColor = !!questColor;
  const label = d.label || 'Untitled Quest';
  const iconUrl = d.iconUrl as string | undefined;
  const hasIcon = d.icon as string;
  const smartFilter: string | undefined = d.smartFilter as string | undefined;
  const isOptional = d.optional as boolean;
  const pixelSize = d.pixelSize as { width: number; height: number } | undefined;
  const shapeTextures = d.shapeTextures as { background: string; outline: string; shape: string } | undefined;
  // When the instance's real FTB shape textures are available, the shape is
  // baked to a single square tile by `bakeShapeTile` (grey fill + outline),
  // which matches the FTB assets exactly (gear teeth, octagon sides, etc.) and
  // avoids CSS stretching that distorted shape geometry under WebKit.
  const shapeBg = shapeTextures?.background || '';
  const shapeOutline = shapeTextures?.outline || '';
  const hasShapeTextures = !!(shapeBg && shapeOutline);
  const nodeWidth = pixelSize?.width || 180;
  const nodeHeight = pixelSize?.height || 120;
  // FTB shape tiles are always square, so size the tile off the node's smaller
  // dimension regardless of the node box. 0.95 fills the tile like the in-game
  // quest book (where the shape IS the tile), leaving a hair for the outline;
  // 0.8 rendered the shape visibly small next to its node.
  const shapeSize = Math.max(16, Math.round(Math.min(nodeWidth, nodeHeight) * 0.95));
  // In-game the quest icon renders at 2/3 of the quest tile's size, scaled by
  // the quest's `icon_scale` (editor range 0.1 – 2.0). The shape is the
  // editor's tile analog, so size the icon to 2/3 of it, applying the same
  // clamp, to match the in-game pixel proportion.
  const iconScale =
    typeof d.icon_scaling === 'number' && Number.isFinite(d.icon_scaling)
      ? Math.min(2.0, Math.max(0.1, d.icon_scaling))
      : 1.0;
  const iconSize = Math.max(8, Math.round(shapeSize * (2 / 3) * iconScale));
  const [imgError, setImgError] = useState(false);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const onRename = d.onRename as ((label: string) => void) | undefined;
  const renameNonce = (d.renameNonce as number) || 0;
  const nonceRef = useRef(0);
  const { applyQuestNodeBorder, getItemIconStyle, isLoaded } = useMcTheme();

  const prevIconUrlRef = useRef(iconUrl);
  useEffect(() => {
    if (prevIconUrlRef.current !== iconUrl) {
      setImgError(false);
      prevIconUrlRef.current = iconUrl;
    }
  }, [iconUrl]);

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

  // Bake the whole shape tile (grey fill + tinted/white outline) into a single
  // square data URL at the display size, so no CSS stretching / scaling can
  // distort the shape geometry (which rendered circles as ovals under WebKit).
  // Explicit quest colors tint the outline to that color; quests without an
  // explicit color keep the in-game not-started default, a near-white outline
  // at ~58% alpha.
  useEffect(() => {
    let cancelled = false;
    if (shapeBg && shapeOutline) {
      bakeShapeTile({
        backgroundUrl: shapeBg,
        outlineUrl: shapeOutline,
        color: hasQuestColor ? questColor : undefined,
        size: shapeSize,
      }).then((url) => {
        if (!cancelled) setTileUrl(url);
      });
    } else {
      setTileUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [shapeBg, shapeOutline, hasQuestColor, questColor, shapeSize]);

  const borderStyle = applyQuestNodeBorder(shape);
  const hasBorderTexture = Object.keys(borderStyle).length > 0;
  const iconStyle = hasIcon && isLoaded ? getItemIconStyle(d.icon as string) : {};

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

  const fallbackColor = hasQuestColor ? questColor! : SHAPE_OUTLINE_GREY;

  return (
    <div
      className={`ftb-quest-node${selected ? ' selected' : ''}${isOptional ? ' optional' : ''}${isSimHidden ? ' sim-hidden' : ''}${isSimLocked ? ' sim-locked' : ''}${simComplete ? ' sim-complete' : ''}${isLink ? ' quest-link' : ''}${isSearchDim ? ' search-dim' : ''}${isSearchMatch ? ' search-match' : ''}`}
      style={{
        width: nodeWidth,
        height: nodeHeight,
      }}
    >
      <Handle type="target" position={Position.Top} className="ftb-node-handle" id="t" />
      <Handle type="target" position={Position.Left} className="ftb-node-handle" id="l" />
      <Handle type="target" position={Position.Right} className="ftb-node-handle" id="r" />
      <Handle type="target" position={Position.Bottom} className="ftb-node-handle" id="b" />
      <div className={`ftb-quest-shape-wrap shape-${shape}${hasShapeTextures ? ' has-texture' : ''}`} style={{
        ['--shape-color' as string]: fallbackColor,
        backgroundColor: shape === 'none' || hasShapeTextures ? 'transparent' : (hasQuestColor ? `${questColor}22` : SHAPE_PLATE_GREY),
        borderColor: hasBorderTexture || shape === 'none' ? undefined : fallbackColor,
        width: shapeSize,
        height: shapeSize,
        ...(hasBorderTexture ? borderStyle : {}),
      }}>
        {hasShapeTextures && tileUrl && (
          <img
            className="ftb-quest-shape-tile"
            src={tileUrl}
            alt=""
            draggable={false}
          />
        )}
        {hasIcon && (
          <div className="ftb-quest-node-icon" style={{ ...(Object.keys(iconStyle).length > 0 ? iconStyle : {}), width: iconSize, height: iconSize }}>
            {iconUrl && !imgError ? (
              <AnimatedSprite url={iconUrl} textureKey={hasIcon} width={iconSize} height={iconSize} alt="" className="ftb-quest-node-icon-img" onError={() => setImgError(true)} />
            ) : (
              <span className="ftb-quest-node-icon-fallback" title="Quest has no icon"><BookIcon size={16} /></span>
            )}
          </div>
        )}
        {!hasIcon && smartFilter && (
          <div className="ftb-quest-node-icon" style={{ width: iconSize, height: iconSize }}>
            <SmartFilterIcon
              dsl={smartFilter}
              textureIndex={d.textureIndex || {}}
              fallback={null}
              size={iconSize}
              imgSize={iconSize}
            />
          </div>
        )}
      </div>
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
      <Handle type="source" position={Position.Bottom} className="ftb-node-handle" id="sb" />
      <Handle type="source" position={Position.Right} className="ftb-node-handle" id="sr" />
      <Handle type="source" position={Position.Left} className="ftb-node-handle" id="sl" />
      <Handle type="source" position={Position.Top} className="ftb-node-handle" id="st" />
    </div>
  );
});

export const nodeTypes = {
  quest: QuestNodeComponent,
};
