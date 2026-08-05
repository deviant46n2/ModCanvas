import { useEffect, useState } from 'react'
import type { RecipeIngredient } from '../../core/recipe/recipe-store'
import { SLOT_DRAG_MIME, recipeIngredientFromPayload, type SlotDragPayload } from '../../core/recipe/dnd'
import { AnimatedSprite } from '../quest/AnimatedSprite'
import { getTagItems, requestResolveTags, subscribeTagChanges } from '../../services/smart-filter-tags'

interface RecipeSlotProps {
  ingredient: RecipeIngredient | null
  /** Shapeless cells can carry a count badge (shaped pattern keys cannot). */
  shapeless: boolean
  instancePath: string
  getTextureUrl: (itemId: string) => string | null
  onPick: () => void
  onClear: () => void
  onDropIngredient: (ing: RecipeIngredient) => void
  onSetCount: (count: number) => void
}

const MAX_TAG_TOOLTIP = 8

/** A single MC-authentic crafting cell: 48px beveled slot, 32px pixel icon
 *  (animated textures free via AnimatedSprite), count badge (shapeless only),
 *  `#` ribbon for tag cells with a member tooltip, click → picker,
 *  double-click → clear, drag/drop, and a filled-cell context menu. */
export function RecipeSlot({
  ingredient,
  shapeless,
  instancePath,
  getTextureUrl,
  onPick,
  onClear,
  onDropIngredient,
  onSetCount,
}: RecipeSlotProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [countEditing, setCountEditing] = useState(false)
  const [countDraft, setCountDraft] = useState('')
  const [hovering, setHovering] = useState(false)
  const [, setTagTick] = useState(0)

  // Re-render when tag members resolve so the hover tooltip fills in.
  useEffect(() => subscribeTagChanges(() => setTagTick((t) => t + 1)), [])

  const filled = ingredient !== null
  const tag = filled && ingredient!.tag ? ingredient!.item.replace(/^#/, '') : null
  const iconKey = filled ? ingredient!.item.replace(/^#/, '') : ''
  const iconUrl = filled ? getTextureUrl(iconKey) : null

  // Resolve members on hover so the tooltip can show them.
  useEffect(() => {
    if (hovering && tag) requestResolveTags([tag], instancePath)
  }, [hovering, tag, instancePath])

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  const tagMembers = tag ? getTagItems(tag) ?? [] : []

  const readPayload = (e: React.DragEvent): RecipeIngredient | null => {
    const raw = e.dataTransfer.getData(SLOT_DRAG_MIME)
    if (!raw) return null
    try {
      return recipeIngredientFromPayload(JSON.parse(raw) as SlotDragPayload)
    } catch {
      return null
    }
  }

  const commitCount = () => {
    const n = parseInt(countDraft, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= 64) onSetCount(n)
    setCountEditing(false)
  }

  return (
    <div
      className={[
        'recipe-slot',
        filled ? (ingredient!.tag ? 'is-tag' : 'is-filled') : 'is-empty',
        hovering ? 'is-hover' : '',
      ].join(' ')}
      onClick={onPick}
      onDoubleClick={() => filled && onClear()}
      onContextMenu={(e) => {
        if (!filled) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragStart={(e) => {
        if (!filled) return
        const p = ingredient!
        e.dataTransfer.setData(SLOT_DRAG_MIME, JSON.stringify({ item: p.item, name: p.item, tag: p.tag }))
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onDrop={(e) => {
        e.preventDefault()
        const ing = readPayload(e)
        if (ing) onDropIngredient(ing)
      }}
      title={
        filled
          ? `${ingredient!.tag ? '#' : ''}${ingredient!.item}${shapeless && ingredient!.count && ingredient!.count > 1 ? ` ×${ingredient!.count}` : ''}`
          : 'Click to pick an item'
      }
    >
      {filled && !ingredient!.tag && iconUrl && (
        <AnimatedSprite url={iconUrl} textureKey={iconKey} width={32} height={32} alt="" />
      )}
      {filled && !ingredient!.tag && !iconUrl && (
        <span className="recipe-slot-fallback">?</span>
      )}
      {filled && ingredient!.tag && (
        <>
          <span className="recipe-slot-tag-ribbon">#</span>
          <span className="recipe-slot-tag-id">{ingredient!.item.replace(/^#/, '')}</span>
        </>
      )}
      {filled && shapeless && ingredient!.count && ingredient!.count > 1 && (
        <span className="recipe-slot-count">{ingredient!.count}</span>
      )}

      {hovering && filled && ingredient!.tag && (
        <div className="recipe-slot-tooltip">
          <div className="recipe-slot-tooltip-head">#{tag} · {tagMembers.length} members</div>
          {tagMembers.length > 0 && (
            <ul className="recipe-slot-tooltip-members">
              {tagMembers.slice(0, MAX_TAG_TOOLTIP).map((m) => (
                <li key={m}>{m}</li>
              ))}
              {tagMembers.length > MAX_TAG_TOOLTIP && (
                <li>… and {tagMembers.length - MAX_TAG_TOOLTIP} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {menu && (
        <div
          className="recipe-slot-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { onPick(); setMenu(null) }}>Replace…</button>
          {shapeless && (
            <button
              type="button"
              onClick={() => {
                setCountDraft(String(ingredient?.count ?? 1))
                setCountEditing(true)
                setMenu(null)
              }}
            >
              Set count…
            </button>
          )}
          <button type="button" className="danger" onClick={() => { onClear(); setMenu(null) }}>Clear</button>
        </div>
      )}

      {countEditing && (
        <div className="recipe-slot-count-editor" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            min={1}
            max={64}
            autoFocus
            value={countDraft}
            onChange={(e) => setCountDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCount()
              if (e.key === 'Escape') setCountEditing(false)
              e.stopPropagation()
            }}
            onBlur={commitCount}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default RecipeSlot
