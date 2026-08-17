import { useState, useCallback, useMemo, useEffect } from 'react'
import { XIcon } from '../ui/icons'
import type { QuestGraphData } from '../../services/api'
import type { ItemRegistryEntry } from '../../services/quest-types'
import { isUsableTextureValue, textureDisplayUrl, requestMaterialize } from '../../services/texture-loader'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { getPackIndex } from '../../services/pack-index'
import { AnimatedSprite } from './AnimatedSprite'

interface IconPickerProps {
  open: boolean
  target: { type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book'; nodeId?: string } | null
  textureIndex: Record<string, string>
  graph: QuestGraphData
  instancePath: string
  onGraphChange: (g: QuestGraphData) => void
  onClose: () => void
  scheduleAutoSave: () => void
}

/**
 * Icon picker for quest/chapter/book icons. Lists the ITEM REGISTRY (s59: the
 * companion's authoritative BuiltInRegistries.ITEM dump) — real items, sorted
 * by name, with real display names. The old behavior listed raw texture-index
 * keys (14k of them, first 200, unordered): potions/banners/arrows existed but
 * were buried in a random key dump — "no sense of organization". The registry
 * is empty before the first companion connect, so the picker falls back to
 * texture keys then rather than showing nothing.
 */
export function IconPicker({ open, target, textureIndex, graph, instancePath, onGraphChange, onClose, scheduleAutoSave }: IconPickerProps) {
  const [search, setSearch] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [usageByItem, setUsageByItem] = useState<Map<string, { recipes: number; quests: number; tags: number }> | null>(null)
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry)

  // Pack Index "where is this used" footer (P1-PACKINDEX consumer): fetch the
  // derived index once per open, memoized per project by the service, and
  // build the reverse lookup. Failures degrade to no footer (the picker must
  // never block on the index).
  useEffect(() => {
    if (!open || !graph.project_id) return
    let cancelled = false
    getPackIndex(graph.project_id)
      .then((idx) => {
        if (cancelled) return
        const usage = new Map<string, { recipes: number; quests: number; tags: number }>()
        for (const ref of idx.references) {
          const cur = usage.get(ref.item_id) ?? { recipes: 0, quests: 0, tags: 0 }
          if (ref.source_kind === 'recipe') cur.recipes += 1
          else if (ref.source_kind === 'quest') cur.quests += 1
          else if (ref.source_kind === 'tag') cur.tags += 1
          usage.set(ref.item_id, cur)
        }
        setUsageByItem(usage)
      })
      .catch(() => { if (!cancelled) setUsageByItem(null) })
    return () => { cancelled = true }
  }, [open, graph.project_id])

  const items = itemRegistry ?? []

  // Registry-first: real items sorted by display name. Empty registry (pre
  // first launch) falls back to raw texture-index keys so the picker is never
  // dead — the old behavior, but filtered to item-like paths only.
  //
  // s60: NO 200-item cap on the registry path — with 1347 real items the cap
  // truncated the alphabet at "B" (banners/beds/potions unreachable). The
  // modal body scrolls (ftb-popup-body: max-height 60vh), and materialization
  // is batched at 500 by the loader, so an uncapped grid is safe. The cap
  // survives only on the texture-key FALLBACK: that path can still see the
  // full ~14k key wall pre-first-launch, which is what the cap was built for.
  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    if (items.length > 0) {
      const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name))
      if (!search) return sorted
      return sorted.filter((it) => it.name.toLowerCase().includes(s) || it.id.toLowerCase().includes(s))
    }
    // Fallback: raw texture keys, item-like paths only (no gui/, shapes/,
    // entity/ noise), matching the old picker's contract when no game has
    // connected yet.
    const entries = Object.entries(textureIndex)
      .filter(([key]) => !key.includes('gui/') && !key.includes('shapes/') && !key.includes('entity/'))
    if (!search) return entries.slice(0, 200)
    return entries.filter(([key]) => key.toLowerCase().includes(s)).slice(0, 200)
  }, [items, textureIndex, search])

  // Materialize any non-displayable sources for the visible entries. Registry
  // items resolve through the texture index by id (`minecraft:potion` →
  // jar descriptor → data URL); texture-key entries resolve directly.
  useEffect(() => {
    if (!open || !instancePath || filtered.length === 0) return
    const keys: string[] = []
    for (const entry of filtered) {
      if (items.length > 0) {
        const id = (entry as ItemRegistryEntry).id
        if (!textureDisplayUrl(textureIndex, id) && !isUsableTextureValue(id)) keys.push(id)
      } else {
        const [key] = entry as [string, string]
        if (!isUsableTextureValue((entry as [string, string])[1])) keys.push(key)
      }
    }
    if (keys.length > 0) requestMaterialize(keys, instancePath)
  }, [open, instancePath, filtered, items.length, textureIndex])

  const selectIcon = useCallback((itemId: string) => {
    if (!target || !graph) return
    const { type, nodeId } = target
    if (type === 'book') {
      onGraphChange({ ...graph, book_icon: itemId })
      setTimeout(() => scheduleAutoSave(), 300)
    } else if (type === 'chapter' && nodeId) {
      const updatedChapters = graph.chapters.map(ch =>
        ch.id === nodeId ? { ...ch, icon: itemId } : ch
      )
      onGraphChange({ ...graph, chapters: updatedChapters })
      setTimeout(() => scheduleAutoSave(), 300)
    } else if (nodeId) {
      const updatedNodes = graph.nodes.map(n =>
        n.id === nodeId
          ? { ...n, icon: itemId, iconDataUrl: textureDisplayUrl(textureIndex, itemId) || '' }
          : n
      )
      onGraphChange({ ...graph, nodes: updatedNodes })
      setTimeout(() => scheduleAutoSave(), 300)
    }
    onClose()
  }, [target, graph, textureIndex, onGraphChange, onClose, scheduleAutoSave])

  if (!open) return null

  return (
    <div className="ftb-quest-popup-overlay" onClick={onClose}>
      <div className="ftb-quest-popup icon-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ftb-popup-header">
          <div className="ftb-popup-header-left">
            <div className="ftb-popup-title">Select Icon</div>
            <div className="ftb-popup-type">{target?.type || 'quest'}</div>
          </div>
          <button className="ftb-popup-close" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="ftb-popup-body">
          <input
            type="text"
            placeholder={items.length > 0 ? 'Search items...' : 'Search textures...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #313244', background: '#181825', color: '#cdd6f4', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }}
          />
          <div className="icon-picker-grid">
            {filtered.map((entry) => {
              const item = items.length > 0 ? entry as ItemRegistryEntry : null
              const key = item ? item.id : (entry as [string, string])[0]
              const fallback = item ? undefined : (entry as [string, string])[1]
              return (
                <button
                  key={key}
                  className="icon-picker-item"
                  onClick={() => selectIcon(key)}
                  onMouseEnter={() => setHoveredId(key)}
                  style={{ aspectRatio: '1/1', padding: '8px', minHeight: 0 }}
                >
                  <AnimatedSprite url={textureDisplayUrl(textureIndex, key) || fallback || ''} textureKey={key} width={40} height={40} alt="" imageRendering="pixelated" className="icon-picker-img" />
                  <span className="icon-picker-label">{item ? item.name : key}</span>
                </button>
              )
            })}
          </div>
          {usageByItem && hoveredId && (
            <div className="icon-picker-usage" style={{ marginTop: 8, fontSize: 11, opacity: 0.75, textAlign: 'center' }}>
              {(() => {
                const u = usageByItem.get(hoveredId)
                if (!u || (u.recipes === 0 && u.quests === 0 && u.tags === 0)) {
                  return <span>Not referenced by any recipe, quest, or tag in this pack</span>
                }
                const parts: string[] = []
                if (u.recipes > 0) parts.push(`${u.recipes} recipe${u.recipes === 1 ? '' : 's'}`)
                if (u.quests > 0) parts.push(`${u.quests} quest${u.quests === 1 ? '' : 's'}`)
                if (u.tags > 0) parts.push(`${u.tags} tag${u.tags === 1 ? '' : 's'}`)
                return <span>Used in {parts.join(', ')}</span>
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
