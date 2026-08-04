import { useState, useEffect } from 'react'
import { XIcon } from '../ui/icons'
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
          <button className="ftb-popup-close" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
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
              <label>Grid Scale (snap)</label>
              <input type="number" step="0.1" value={graph.grid_scale ?? 0.5} onChange={(e) => onGraphChange({ ...graph, grid_scale: parseFloat(e.target.value) || 0.5 })} />
            </div>
          </div>
          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Global Defaults (data.snbt)</div>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.default_reward_team || false} onChange={(e) => onGraphChange({ ...graph, default_reward_team: e.target.checked })} />
              <span>Rewards go to the whole team</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.default_consume_items || false} onChange={(e) => onGraphChange({ ...graph, default_consume_items: e.target.checked })} />
              <span>Consume items on task completion</span>
            </label>
            <div className="ftb-popup-field">
              <label>Autoclaim Rewards</label>
              <select value={graph.default_autoclaim_rewards || 'disabled'} onChange={(e) => onGraphChange({ ...graph, default_autoclaim_rewards: e.target.value })}>
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
                <option value="no_toast">No Toast</option>
                <option value="invisible">Invisible</option>
              </select>
            </div>
            <div className="ftb-popup-field">
              <label>Detection Delay (ticks)</label>
              <input type="number" min="0" max="200" value={graph.detection_delay ?? 20} onChange={(e) => onGraphChange({ ...graph, detection_delay: parseInt(e.target.value) || 20 })} />
            </div>
          </div>
          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Book Behavior (data.snbt)</div>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.show_lock_icons ?? true} onChange={(e) => onGraphChange({ ...graph, show_lock_icons: e.target.checked })} />
              <span>Show lock icons on locked quests</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.pause_game ?? false} onChange={(e) => onGraphChange({ ...graph, pause_game: e.target.checked })} />
              <span>Pause game while the book is open</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.disable_gui ?? false} onChange={(e) => onGraphChange({ ...graph, disable_gui: e.target.checked })} />
              <span>Disable opening the quest book in-game</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.drop_book_on_death ?? false} onChange={(e) => onGraphChange({ ...graph, drop_book_on_death: e.target.checked })} />
              <span>Drop the quest book on death</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.drop_loot_crates ?? false} onChange={(e) => onGraphChange({ ...graph, drop_loot_crates: e.target.checked })} />
              <span>Drop loot crates on kill</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.hide_excluded_quests ?? false} onChange={(e) => onGraphChange({ ...graph, hide_excluded_quests: e.target.checked })} />
              <span>Hide quests excluded from the team</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.verify_on_load ?? false} onChange={(e) => onGraphChange({ ...graph, verify_on_load: e.target.checked })} />
              <span>Verify quest file integrity on load</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={graph.default_quest_disable_jei ?? false} onChange={(e) => onGraphChange({ ...graph, default_quest_disable_jei: e.target.checked })} />
              <span>Disable JEI for quests by default</span>
            </label>
            <div className="ftb-popup-field">
              <label>Lock Message</label>
              <input type="text" value={graph.lock_message || ''} onChange={(e) => onGraphChange({ ...graph, lock_message: e.target.value })} placeholder="e.g. Complete earlier quests to unlock this" />
            </div>
            <div className="ftb-popup-field">
              <label>Fallback Locale</label>
              <input type="text" value={graph.fallback_locale || ''} onChange={(e) => onGraphChange({ ...graph, fallback_locale: e.target.value })} placeholder="e.g. en_us" />
            </div>
            <div className="ftb-popup-field">
              <label>Emergency Items Cooldown (seconds)</label>
              <input type="number" min="0" value={graph.emergency_items_cooldown ?? 300} onChange={(e) => onGraphChange({ ...graph, emergency_items_cooldown: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="ftb-popup-field">
              <label>Emergency Items (id + count per line)</label>
              <textarea
                rows={3}
                value={(graph.emergency_items || []).map((it) => `${it.id} ${it.count}`).join('\n')}
                onChange={(e) => {
                  const items = e.target.value.split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [id, count] = line.split(/\s+/)
                      return { id, count: parseInt(count) || 1 }
                    })
                  onGraphChange({ ...graph, emergency_items: items })
                }}
                placeholder={"minecraft:grass_block 1\nminecraft:oak_sapling 1"}
              />
            </div>
            <div className="ftb-popup-field">
              <label>Loot Crate No-Drop % (boss / monster / passive)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" min="0" max="100" value={graph.loot_crate_no_drop?.boss ?? 0} onChange={(e) => onGraphChange({ ...graph, loot_crate_no_drop: { boss: parseInt(e.target.value) || 0, monster: graph.loot_crate_no_drop?.monster ?? 0, passive: graph.loot_crate_no_drop?.passive ?? 0 } })} />
                <input type="number" min="0" max="100" value={graph.loot_crate_no_drop?.monster ?? 0} onChange={(e) => onGraphChange({ ...graph, loot_crate_no_drop: { boss: graph.loot_crate_no_drop?.boss ?? 0, monster: parseInt(e.target.value) || 0, passive: graph.loot_crate_no_drop?.passive ?? 0 } })} />
                <input type="number" min="0" max="100" value={graph.loot_crate_no_drop?.passive ?? 0} onChange={(e) => onGraphChange({ ...graph, loot_crate_no_drop: { boss: graph.loot_crate_no_drop?.boss ?? 0, monster: graph.loot_crate_no_drop?.monster ?? 0, passive: parseInt(e.target.value) || 0 } })} />
              </div>
            </div>
          </div>
          <div className="ftb-popup-section">
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
                {Object.keys(textureIndex).length} textures loaded
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
