import { useState, useCallback, useMemo, useEffect } from 'react'
import type { QuestGraphData } from '../../services/api'
import { isUsableTextureValue, textureDisplayUrl, requestMaterialize } from '../../services/texture-loader'
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

export function IconPicker({ open, target, textureIndex, graph, instancePath, onGraphChange, onClose, scheduleAutoSave }: IconPickerProps) {
  const [search, setSearch] = useState('')

  const filteredIcons = useMemo(() => {
    if (!textureIndex) return []
    const entries = Object.entries(textureIndex)
    if (!search) return entries.slice(0, 200)
    const s = search.toLowerCase()
    return entries.filter(([key]) => key.toLowerCase().includes(s)).slice(0, 200)
  }, [textureIndex, search])

  useEffect(() => {
    if (!open || !instancePath || filteredIcons.length === 0) return
    const pending = filteredIcons
      .filter(([, dataUrl]) => !isUsableTextureValue(dataUrl))
      .map(([key]) => key)
    if (pending.length > 0) requestMaterialize(pending, instancePath)
  }, [open, instancePath, filteredIcons])

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
          <button className="ftb-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="ftb-popup-body">
          <input
            type="text"
            placeholder="Search textures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #313244', background: '#181825', color: '#cdd6f4', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }}
          />
          <div className="icon-picker-grid">
            {filteredIcons.map(([itemId, dataUrl]) => (
              <button
                key={itemId}
                className="icon-picker-item"
                onClick={() => selectIcon(itemId)}
                style={{ aspectRatio: '1/1', padding: '8px', minHeight: 0 }}
              >
                <AnimatedSprite url={textureDisplayUrl(textureIndex, itemId) || dataUrl} textureKey={itemId} width={40} height={40} alt="" imageRendering="pixelated" className="icon-picker-img" />
                <span className="icon-picker-label">{itemId}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
