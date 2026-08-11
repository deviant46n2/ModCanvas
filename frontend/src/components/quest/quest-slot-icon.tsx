import { questIconUrl, resolveIconKey } from './questIcons'
import { getFallbackIcon, TYPE_TEXTURE_KEYS } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'

export interface QuestSlotIconProps {
  /** Item registry key (objective target / fluid, or reward item id). */
  target: string
  smartFilter?: string
  /** Objective type id — drives the fallback glyph when no texture exists. */
  objectiveType?: string
  textureIndex: Record<string, string>
  size?: number
  className?: string
  onClick?: () => void
  title?: string
}

/**
 * Self-authored checkmark glyph (this repo's own icon — never a copied game
 * asset). FTB Quests renders `checkmark`-type tasks as a green checkmark in
 * game; the drawer mirrors that. Rendered as SVG so it stays crisp at any
 * strip size and needs no bundled image file.
 */
export function CheckmarkGlyph({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className="quest-detail-checkmark-glyph"
    >
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The icon for one task/reward — the in-game quest view renders tasks and
 * rewards as a strip of icon slots; this renders the icon exactly the same
 * way everywhere (cards and strips share it, so they can never drift):
 * smart-filter DSL → the filter glyph, else the item texture (or the type's
 * fixed in-game icon, e.g. the enchanting bottle for XP), else the type
 * fallback glyph.
 */
export function QuestSlotIcon({
  target,
  smartFilter,
  objectiveType,
  textureIndex,
  size = 24,
  className,
  onClick,
  title,
}: QuestSlotIconProps) {
  // Types like XP carry no target item but still render a fixed in-game icon
  // (the enchanting bottle) — resolve the type's texture key when the target
  // is empty so the strip matches the game.
  const effectiveTarget = target || TYPE_TEXTURE_KEYS[objectiveType || ''] || ''
  const key = resolveIconKey(effectiveTarget)
  const iconUrl = questIconUrl(effectiveTarget, textureIndex)
  const pending = isTexturePending(textureIndex, key)

  return (
    <div
      className={className || 'quest-detail-task-icon'}
      style={{ width: size, height: size, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={title}
    >
      {smartFilter ? (
        <SmartFilterIcon dsl={smartFilter} textureIndex={textureIndex} fallback={getFallbackIcon(objectiveType ?? '')} size={size} />
      ) : iconUrl ? (
        <AnimatedSprite url={iconUrl} textureKey={key} width={size} height={size} alt="" />
      ) : pending ? (
        <QuestIcon pending url={null} fallback="" size={size} />
      ) : objectiveType === 'checkmark' ? (
        <span className="quest-detail-checkmark" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckmarkGlyph size={Math.round(size * 0.82)} />
        </span>
      ) : (
        <span className="quest-detail-item-fallback">{getFallbackIcon(objectiveType ?? '')}</span>
      )}
    </div>
  )
}
