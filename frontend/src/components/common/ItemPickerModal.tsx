import { useState, useMemo, useRef, useEffect } from 'react'
import { XIcon } from '../ui/icons'
import { Grid, type CellComponentProps } from 'react-window'
import type { ItemRegistryEntry } from '../../services/api'
import { parseItemQuery } from '../../services/item-registry'
import './ItemPickerModal.css'

interface ItemPickerModalProps {
  items: ItemRegistryEntry[]
  onSelect: (itemId: string) => void
  onClose: () => void
  /** Lazy icon resolver (e.g. `textureDisplayUrl` over the live texture
   *  index). Tried first; falls back to the entry's `texture_data_url`. */
  getTextureUrl?: (itemId: string) => string | null
}

const COLUMNS = 8
const CELL_SIZE = 40
const OVERSCAN_ROWS = 4

type ItemCellData = {
  items: ItemRegistryEntry[]
  getUrl: (id: string) => string | null
  onSelectRef: React.MutableRefObject<(id: string) => void>
  onHoverRef: React.MutableRefObject<(item: ItemRegistryEntry | null, x: number, y: number) => void>
}

function ItemCell({ columnIndex, rowIndex, items, getUrl, onSelectRef, onHoverRef, style }: CellComponentProps<ItemCellData>) {
  const index = rowIndex * COLUMNS + columnIndex
  const item = items[index]
  if (!item) return <div style={style} />

  const url = getUrl(item.id) ?? item.texture_data_url
  return (
    <div style={style}>
      <div
        className="item-picker-slot"
        onClick={() => onSelectRef.current(item.id)}
        onMouseEnter={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseMove={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseLeave={() => onHoverRef.current(null, 0, 0)}
      >
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : (
          <span className="item-picker-slot-fallback">?</span>
        )}
      </div>
    </div>
  )
}

export function ItemPickerModal({ items, onSelect, onClose, getTextureUrl }: ItemPickerModalProps) {
  const [search, setSearch] = useState('')
  const [hoveredItem, setHoveredItem] = useState<ItemRegistryEntry | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState(400)

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const onHoverRef = useRef((_item: ItemRegistryEntry | null, _x: number, _y: number) => {})
  onHoverRef.current = (item, x, y) => {
    setHoveredItem(item)
    if (item) setTooltipPos({ x, y })
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGridHeight(entry.contentRect.height)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const filtered = useMemo(() => {
    const { modFilter, textSearch } = parseItemQuery(search)
    return items.filter((item) => {
      if (modFilter && item.mod_id.toLowerCase() !== modFilter) return false
      if (textSearch) {
        const nameMatch = item.name.toLowerCase().includes(textSearch)
        const idMatch = item.id.toLowerCase().includes(textSearch)
        if (!nameMatch && !idMatch) return false
      }
      return true
    })
  }, [items, search])

  const rowCount = Math.max(Math.ceil(filtered.length / COLUMNS), 1)

  return (
    <div className="item-picker-overlay">
      <div className="item-picker-backdrop" onClick={onClose} />
      <div className="item-picker-panel">
        <div className="item-picker-header">
          <span className="item-picker-title">Item Selector</span>
          <button className="item-picker-close" onClick={onClose} aria-label="Close item browser"><XIcon size={14} /></button>
        </div>

        <div className="item-picker-search-area">
          <input
            className="item-picker-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items...  (use @modid to filter)"
            autoFocus
          />
        </div>

        <div className="item-picker-result-count">
          {filtered.length === items.length
            ? `${items.length} items`
            : `${filtered.length} / ${items.length} items`}
        </div>

        <div className="item-picker-grid-container" ref={containerRef}>
          {filtered.length === 0 ? (
            <div className="item-picker-empty">
              {search ? 'No items match your search' : 'No items found in instance'}
            </div>
          ) : (
            <Grid
              cellComponent={ItemCell}
              cellProps={{
                items: filtered,
                getUrl: getTextureUrl ?? (() => null),
                onSelectRef,
                onHoverRef,
              }}
              columnCount={COLUMNS}
              columnWidth={CELL_SIZE}
              rowCount={rowCount}
              rowHeight={CELL_SIZE}
              overscanCount={OVERSCAN_ROWS}
              style={{ height: gridHeight, width: COLUMNS * CELL_SIZE }}
            />
          )}
        </div>
      </div>

      {hoveredItem && (
        <div className="item-picker-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className="item-picker-tooltip-name">{hoveredItem.name}</div>
          <div className="item-picker-tooltip-id">{hoveredItem.id}</div>
        </div>
      )}
    </div>
  )
}

export default ItemPickerModal
