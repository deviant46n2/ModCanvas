import { useState, useMemo, useRef, useEffect } from 'react'
import { XIcon } from '../ui/icons'
import { Grid, type CellComponentProps } from 'react-window'
import type { ItemRegistryEntry } from '../../services/api'
import './JeiDrawer.css'

interface JeiDrawerProps {
  items: ItemRegistryEntry[]
  onSelect: (itemId: string) => void
  onClose: () => void
}

const COLUMNS = 8
const CELL_SIZE = 40
const OVERSCAN_ROWS = 4

type ItemCellData = {
  items: ItemRegistryEntry[]
  onSelectRef: React.MutableRefObject<(id: string) => void>
  onHoverRef: React.MutableRefObject<(item: ItemRegistryEntry | null, x: number, y: number) => void>
}

function ItemCell({ columnIndex, rowIndex, items, onSelectRef, onHoverRef, style }: CellComponentProps<ItemCellData>) {
  const index = rowIndex * COLUMNS + columnIndex
  const item = items[index]
  if (!item) return <div style={style} />

  return (
    <div style={style}>
      <div
        className="jei-drawer-slot"
        onClick={() => onSelectRef.current(item.id)}
        onMouseEnter={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseMove={(e) => onHoverRef.current(item, e.clientX + 12, e.clientY + 12)}
        onMouseLeave={() => onHoverRef.current(null, 0, 0)}
      >
        {item.texture_data_url ? (
          <img src={item.texture_data_url} alt="" draggable={false} />
        ) : (
          <span className="jei-drawer-slot-fallback">?</span>
        )}
      </div>
    </div>
  )
}

function parseSearch(query: string): { modFilter?: string; textSearch: string } {
  let remaining = query.trim()
  let modFilter: string | undefined

  const modMatch = remaining.match(/@(\S+)/)
  if (modMatch) {
    modFilter = modMatch[1].toLowerCase()
    remaining = remaining.replace(modMatch[0], '').trim()
  }

  return { modFilter, textSearch: remaining.toLowerCase() }
}

export function JeiDrawer({ items, onSelect, onClose }: JeiDrawerProps) {
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
    const { modFilter, textSearch } = parseSearch(search)
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
    <div className="jei-drawer-overlay">
      <div className="jei-drawer-backdrop" onClick={onClose} />
      <div className="jei-drawer-panel">
        <div className="jei-drawer-header">
          <span className="jei-drawer-title">Item Selector</span>
          <button className="jei-drawer-close" onClick={onClose} aria-label="Close item browser"><XIcon size={14} /></button>
        </div>

        <div className="jei-drawer-search-area">
          <input
            className="jei-drawer-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items...  (use @modid to filter)"
            autoFocus
          />
        </div>

        <div className="jei-drawer-result-count">
          {filtered.length === items.length
            ? `${items.length} items`
            : `${filtered.length} / ${items.length} items`}
        </div>

        <div className="jei-drawer-grid-container" ref={containerRef}>
          {filtered.length === 0 ? (
            <div className="jei-drawer-empty">
              {search ? 'No items match your search' : 'No items found in instance'}
            </div>
          ) : (
            <Grid
              cellComponent={ItemCell}
              cellProps={{
                items: filtered,
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
        <div className="jei-drawer-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className="jei-drawer-tooltip-name">{hoveredItem.name}</div>
          <div className="jei-drawer-tooltip-id">{hoveredItem.id}</div>
        </div>
      )}
    </div>
  )
}

export default JeiDrawer
