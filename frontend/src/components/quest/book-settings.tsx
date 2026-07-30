import { useState, useEffect } from 'react'
import type { QuestGraphData } from '../../services/api'
import { scanModJarTextures } from '../../services/api'
import { SHAPES, PROGRESSION_MODES } from './quest-helpers'

interface BookSettingsProps {
  open: boolean
  graph: QuestGraphData
  onGraphChange: (g: QuestGraphData) => void
  modsDir: string
  onModsDirChange: (dir: string) => void
  textureIndex: Record<string, string>
  onTextureIndexChange: (idx: Record<string, string>) => void
  onClose: () => void
  onSave: () => void
  pickDir: () => Promise<string | null>
}

export function BookSettings({
  open,
  graph,
  onGraphChange,
  modsDir,
  onModsDirChange,
  textureIndex,
  onTextureIndexChange,
  onClose,
  onSave,
  pickDir,
}: BookSettingsProps) {
  const [modsDirInput, setModsDirInput] = useState('')

  useEffect(() => {
    if (open) setModsDirInput(modsDir)
  }, [open, modsDir])

  if (!open) return null

  return (
    <div className="ftb-quest-popup-overlay" onClick={onClose}>
      <div className="ftb-quest-popup" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ftb-popup-header">
          <div className="ftb-popup-header-left">
            <div className="ftb-popup-title">Book Settings</div>
          </div>
          <button className="ftb-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="ftb-popup-body">
          <div className="ftb-popup-section">
            <div className="ftb-popup-field">
              <label>Book Title</label>
              <input type="text" value={graph.name} onChange={(e) => onGraphChange({ ...graph, name: e.target.value })} />
            </div>
            <div className="ftb-popup-field">
              <label>Description</label>
              <textarea value={graph.description} onChange={(e) => onGraphChange({ ...graph, description: e.target.value })} />
            </div>
            <div className="ftb-popup-field">
              <label>Book Progression Mode</label>
              <select value={graph.book_progression_mode} onChange={(e) => onGraphChange({ ...graph, book_progression_mode: e.target.value })}>
                {PROGRESSION_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="ftb-popup-field">
              <label>Default Quest Color</label>
              <input type="color" value={graph.quest_color || '#60a5fa'} onChange={(e) => onGraphChange({ ...graph, quest_color: e.target.value })} />
            </div>
            <div className="ftb-popup-field">
              <label>Default Quest Shape</label>
              <select value={graph.default_quest_shape} onChange={(e) => onGraphChange({ ...graph, default_quest_shape: e.target.value })}>
                {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ftb-popup-field">
              <label>Default Quest Width</label>
              <input type="number" value={graph.default_quest_size?.width || 24} onChange={(e) => onGraphChange({ ...graph, default_quest_size: { ...graph.default_quest_size, width: parseInt(e.target.value) || 24 } })} />
            </div>
            <div className="ftb-popup-field">
              <label>Default Quest Height</label>
              <input type="number" value={graph.default_quest_size?.height || 24} onChange={(e) => onGraphChange({ ...graph, default_quest_size: { ...graph.default_quest_size, height: parseInt(e.target.value) || 24 } })} />
            </div>
            <div className="ftb-popup-field">
              <label>Mods Directory</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={modsDirInput} onChange={(e) => setModsDirInput(e.target.value)} placeholder="e.g. /home/user/instances/MyPack/mods" style={{ flex: 1 }} />
                <button className="ftb-popup-btn" onClick={async () => {
                  const selected = await pickDir()
                  if (!selected) return
                  setModsDirInput(selected)
                  onModsDirChange(selected)
                  const idx = await scanModJarTextures(selected)
                  onTextureIndexChange(idx)
                  alert(`Loaded ${Object.keys(idx).length} textures from ${selected}`)
                }}>Browse</button>
                <button className="ftb-popup-btn primary" onClick={async () => {
                  if (!modsDirInput) return
                  onModsDirChange(modsDirInput)
                  const idx = await scanModJarTextures(modsDirInput)
                  onTextureIndexChange(idx)
                  alert(`Loaded ${Object.keys(idx).length} textures from ${modsDirInput}`)
                }}>Load Textures</button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                🖼 {Object.keys(textureIndex).length} textures loaded
              </div>
            </div>
          </div>
        </div>
        <div className="ftb-popup-footer">
          <div className="ftb-popup-footer-right">
            <button className="ftb-popup-btn" onClick={onClose}>Close</button>
            <button className="ftb-popup-btn primary" onClick={() => { onSave(); onClose() }}>Save & Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
