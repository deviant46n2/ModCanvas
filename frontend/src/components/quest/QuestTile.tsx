import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BookIcon } from '../ui/icons'
import { useMcTheme } from '../theme/theme-context'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
import { bakeShapeTile } from '../../services/shape-textures'

// Fallback shape plate (only when the instance's real shape textures are not
// available): a dark tile like the in-game quest book's, instead of a light one.
// Opaque — a semi-transparent fill let the blue chapter-background image bleed
// through and every plate read steel-blue (s26, same class as the bake fix).
const SHAPE_PLATE_GREY = 'rgba(45, 50, 60, 1)';
const SHAPE_OUTLINE_GREY = '#9aa3b2';

export interface QuestTileProps {
  /** Normalized effective shape ('circle', 'gear', ...). */
  shape: string
  /** Explicit quest color; tints the outline / plate when no shape texture. */
  color?: string
  /** Runtime shape textures (background/outline) resolved from the instance. */
  shapeTextures?: { background: string; outline: string; shape: string }
  /** The baked-tile display size in px (the visible square). */
  size: number
  /** Item registry key of the quest icon. */
  icon?: string
  /** Materialized icon URL (may lag the key; AnimatedSprite falls back). */
  iconUrl?: string | null
  /** `icon_scale` (editor range 0.1–2.0), applied like the canvas does. */
  iconScaling?: number
  /** Smart-filter DSL; rendered as the icon when no icon key is set. */
  smartFilter?: string
  textureIndex?: Record<string, string>
  /** Extra classes for the shape wrap (node-specific state classes). */
  className?: string
  style?: CSSProperties
  /** Rendered at the end of the wrap (e.g. the node's connection handles). */
  children?: ReactNode
  onIconError?: () => void
}

/**
 * The quest TILE — the shape plate + baked shape texture + icon, exactly as
 * the canvas renders it. Shared between the canvas quest node and the
 * quest-detail header so the two can never drift: same bake pipeline, same
 * icon scaling, same fallbacks. No interactions here; nodes attach their own
 * handles via children.
 */
export function QuestTile({
  shape,
  color,
  shapeTextures,
  size,
  icon,
  iconUrl,
  iconScaling,
  smartFilter,
  textureIndex,
  className,
  style,
  children,
  onIconError,
}: QuestTileProps) {
  const { applyQuestNodeBorder, getItemIconStyle, isLoaded } = useMcTheme();
  const shapeBg = shapeTextures?.background || '';
  const shapeOutline = shapeTextures?.outline || '';
  const hasShapeTextures = !!(shapeBg && shapeOutline);
  const hasQuestColor = !!color;
  const fallbackColor = hasQuestColor ? color! : SHAPE_OUTLINE_GREY;

  // In-game the quest icon renders at 2/3 of the quest tile's size, scaled by
  // the quest's `icon_scale` (editor range 0.1–2.0), clamped — mirrors the
  // canvas node exactly.
  const scale =
    typeof iconScaling === 'number' && Number.isFinite(iconScaling)
      ? Math.min(2.0, Math.max(0.1, iconScaling))
      : 1.0;
  const iconSize = Math.max(8, Math.round(size * (2 / 3) * scale));

  const [imgError, setImgError] = useState(false);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const prevIconUrlRef = useRef(iconUrl);
  useEffect(() => {
    if (prevIconUrlRef.current !== iconUrl) {
      setImgError(false);
      prevIconUrlRef.current = iconUrl;
    }
  }, [iconUrl]);

  // Bake the whole shape tile (grey fill + tinted/white outline) into a single
  // square data URL at the display size, so no CSS stretching / scaling can
  // distort the shape geometry (which rendered circles as ovals under WebKit).
  useEffect(() => {
    let cancelled = false;
    if (shapeBg && shapeOutline) {
      bakeShapeTile({
        backgroundUrl: shapeBg,
        outlineUrl: shapeOutline,
        color: hasQuestColor ? color : undefined,
        size,
      }).then((url) => {
        if (!cancelled) setTileUrl(url);
      });
    } else {
      setTileUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [shapeBg, shapeOutline, hasQuestColor, color, size]);

  const borderStyle = applyQuestNodeBorder(shape);
  const hasBorderTexture = Object.keys(borderStyle).length > 0;
  const iconStyle = icon && isLoaded ? getItemIconStyle(icon) : {};

  return (
    <div
      className={`ftb-quest-shape-wrap shape-${shape}${hasShapeTextures ? ' has-texture' : ''}${className ? ` ${className}` : ''}`}
      style={{
        ['--shape-color' as string]: fallbackColor,
        backgroundColor: shape === 'none' || hasShapeTextures ? 'transparent' : (hasQuestColor ? `${color}22` : SHAPE_PLATE_GREY),
        borderColor: hasBorderTexture || shape === 'none' ? undefined : fallbackColor,
        width: size,
        height: size,
        ...(hasBorderTexture ? borderStyle : {}),
        ...style,
      }}
    >
      {hasShapeTextures && tileUrl && (
        <img
          className="ftb-quest-shape-tile"
          src={tileUrl}
          alt=""
          draggable={false}
        />
      )}
      {icon ? (
        <div className="ftb-quest-node-icon" style={{ ...(Object.keys(iconStyle).length > 0 ? iconStyle : {}), width: iconSize, height: iconSize }}>
          {iconUrl && !imgError ? (
            <AnimatedSprite url={iconUrl} textureKey={icon} width={iconSize} height={iconSize} alt="" className="ftb-quest-node-icon-img" onError={() => { setImgError(true); onIconError?.(); }} />
          ) : (
            <span className="ftb-quest-node-icon-fallback" title="Quest has no icon"><BookIcon size={16} /></span>
          )}
        </div>
      ) : smartFilter ? (
        <div className="ftb-quest-node-icon" style={{ width: iconSize, height: iconSize }}>
          <SmartFilterIcon dsl={smartFilter} textureIndex={textureIndex || {}} fallback={null} size={iconSize} imgSize={iconSize} />
        </div>
      ) : null}
      {children}
    </div>
  );
}
