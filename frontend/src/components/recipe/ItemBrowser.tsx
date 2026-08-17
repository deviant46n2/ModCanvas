import { useState, useMemo, useRef, useEffect } from 'react'
import { Grid, type CellComponentProps } from 'react-window'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import { filterRegistryItems } from '../../services/item-registry'
import { filterTagCatalog } from '../../core/recipe/tag-filter'
import { isUsableTextureValue } from '../../services/texture-loader'
import { setDragPayload, clearDragPayload } from '../../core/recipe/dnd'
import { usageSummaryText, type ItemUsage } from '../../core/pack-index/item-usage'
import '../../recipe-styles/item-browser.css'

/** A picked ingredient: either an item id or a `#tag` (tag: true). */
export interface RecipePickValue {
  item: string
  tag: boolean
}

export type BrowserMode = 'pick' | 'browse'

interface ItemBrowserProps {
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getTextureUrl: (itemId: string) => string | null
  mode: BrowserMode
  /** pick mode: fired on slot/chip click. */
  onSelect?: (value: RecipePickValue) => void
  /** browse mode: fired on slot drag start. */
  onDragStart?: (item: ItemRegistryEntry) => void
  /** browse mode: fired on the ⇄ button (item or `#tag`). */
  onShowRecipesUsing?: (itemOrTagId: string) => void
  /** pick mode: hide the tag section (output slots are items only). */
  allowTags?: boolean
  /** Pack Index usage counts per item (P1-PACKINDEX consumer). When present,
   *  the hover tooltip adds the "used in" footer line. Optional — the other
   *  ItemBrowser consumers (pickers, loot, behavior) don't pass it. */
  usageByItem?: Map<string, ItemUsage> | null
}

const CELL_SIZE = 40
const OVERSCAN_ROWS = 4
const MAX_TAGS = 12

type SlotCellData = {
  items: ItemRegistryEntry[]
  columns: number
  getUrl: (id: string) => string | null
  mode: BrowserMode
  onSelectRef: React.MutableRefObject<(v: RecipePickValue) => void>
  onDragStartRef: React.MutableRefObject<(item: ItemRegistryEntry) => void>
  onUsingRef: React.MutableRefObject<(id: string) => void>
  onHoverRef: React.MutableRefObject<(item: ItemRegistryEntry | null, x: number, y: number) => void>
}

function SlotCell({ columnIndex, rowIndex, items, columns, getUrl, mode, onSelectRef, onDragStartRef, onUsingRef, onHoverRef, style }: CellComponentProps<SlotCellData>) {
  const index = rowIndex * columns + columnIndex
  const item = items[index]
  if (!item) return <div style={style} />

  const url =
    getUrl(item.id) ??
    (isUsableTextureValue(item.texture_data_url) ? item.texture_data_url : null)
  return (
    <div style={style}>
      <div
        className="browser-slot"
        draggable={mode === 'browse'}
        onDragStart={(e) => {
          onDragStartRef.current(item)
          if (mode === 'browse') setDragPayload(e.dataTransfer, { item: item.id, name: item.name })
        }}
        onDragEnd={() => clearDragPayload()}
        onClick={() => onSelectRef.current({ item: item.id, tag: false })}
        onMouseEnter={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseMove={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseLeave={() => onHoverRef.current(null, 0, 0)}
        title={item.name}
      >
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : (
          <span className="browser-slot-fallback">?</span>
        )}
        {mode === 'browse' && (
          <button
            type="button"
            className="browser-using"
            onClick={(e) => { e.stopPropagation(); onUsingRef.current(item.id) }}
            title="Show recipes using this item"
          >
            ⇄
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The shared JEI-style item browser — the one surface the recipes tab and
 * the picker both render, so they can never drift. Dense slot grid, search
 * with `@mod` / `#tag` prefixes, hover tooltip, tag chips. Two modes:
 * `pick` (click to select, for the popup) and `browse` (drag into the grid
 * + "show recipes using", for the recipes tab palette).
 */
export function ItemBrowser({
  items,
  tags,
  getTextureUrl,
  mode,
  onSelect,
  onDragStart,
  onShowRecipesUsing,
  allowTags = true,
  usageByItem,
}: ItemBrowserProps) {
  const [search, setSearch] = useState('')
  const [hoveredItem, setHoveredItem] = useState<ItemRegistryEntry | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState(400)
  const [columns, setColumns] = useState(8)

  const onSelectRef = useRef(onSelect ?? (() => {}))
  onSelectRef.current = onSelect ?? (() => {})
  const onDragStartRef = useRef(onDragStart ?? (() => {}))
  onDragStartRef.current = onDragStart ?? (() => {})
  const onUsingRef = useRef(onShowRecipesUsing ?? (() => {}))
  onUsingRef.current = onShowRecipesUsing ?? (() => {})

  const onHoverRef = useRef((_item: ItemRegistryEntry | null, _x: number, _y: number) => {})
  onHoverRef.current = (item, x, y) => {
    setHoveredItem(item)
    if (item) setTooltipPos({ x, y })
  }

  // Column count follows the container width, JEI-style: as many slots as fit.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        setColumns(Math.max(4, Math.floor(w / CELL_SIZE)))
        setGridHeight(entry.contentRect.height)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const q = search.trim().toLowerCase()
  const isTagQuery = q.startsWith('#')
  const tagQ = isTagQuery ? q.slice(1) : q

  const tagMatches = useMemo(() => {
    if (!allowTags) return []
    if (!tagQ) return []
    return filterTagCatalog(tags, tagQ).slice(0, MAX_TAGS)
  }, [tags, tagQ, allowTags])

  const filtered = useMemo(() => {
    if (isTagQuery) return []
    return filterRegistryItems(items, q)
  }, [items, q, isTagQuery])

  const rowCount = Math.max(Math.ceil(filtered.length / columns), 1)
  const showTags = tagMatches.length > 0
  const noResults = filtered.length === 0 && !showTags

  return (
    <div className="item-browser">
      <div className="item-browser-grid" ref={containerRef}>
        {noResults ? (
          <div className="item-browser-empty">
            {search ? 'No items or tags match' : 'No items found in instance'}
          </div>
        ) : (
          <Grid
            cellComponent={SlotCell}
            cellProps={{
              items: filtered,
              columns,
              getUrl: getTextureUrl ?? (() => null),
              mode,
              onSelectRef,
              onDragStartRef,
              onUsingRef,
              onHoverRef,
            }}
            columnCount={columns}
            columnWidth={CELL_SIZE}
            rowCount={rowCount}
            rowHeight={CELL_SIZE}
            overscanCount={OVERSCAN_ROWS}
            style={{ height: gridHeight, width: columns * CELL_SIZE }}
          />
        )}
      </div>

      {showTags && (
        <div className="item-browser-tags">
          {tagMatches.map((t) => (
            <button
              key={t.id}
              type="button"
              className="browser-tag"
              onClick={() => onSelectRef.current({ item: t.id, tag: true })}
              title={`#${t.id} — ${t.member_count} items`}
            >
              <span className="browser-tag-glyph">#</span>
              <span className="browser-tag-id">{t.id}</span>
              <span className="browser-tag-count">{t.member_count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="item-browser-search">
        <input
          className="item-browser-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={allowTags ? 'Search…  @mod  #tag' : 'Search items…'}
        />
        <span className="item-browser-count">
          {isTagQuery && !showTags ? 'no tags' : `${filtered.length}${showTags ? ` + ${tagMatches.length} tags` : ''}`}
        </span>
      </div>

      {hoveredItem && (
        <div className="browser-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className="browser-tooltip-name">{hoveredItem.name}</div>
          <div className="browser-tooltip-id">{hoveredItem.id}</div>
          {hoveredItem.mod_id && <div className="browser-tooltip-mod">{hoveredItem.mod_id}</div>}
          {usageByItem && (
            <div className="browser-tooltip-usage">
              {usageSummaryText(usageByItem.get(hoveredItem.id) ?? { recipes: 0, quests: 0, tags: 0 })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ItemBrowser
