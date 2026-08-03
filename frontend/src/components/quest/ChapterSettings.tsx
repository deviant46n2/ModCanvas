import { useState, useEffect } from 'react'
import { ArrowDownIcon, ArrowUpIcon, BookIcon, XIcon } from '../ui/icons'
import type { QuestChapter, QuestChapterGroup } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { AnimatedSprite } from './AnimatedSprite'
import { SHAPES } from './quest-helpers'
import { CHAPTER_PROGRESSION_MODES } from './quest-form-constants'

interface ChapterSettingsProps {
  open: boolean
  chapter: QuestChapter
  groups: QuestChapterGroup[]
  textureIndex: Record<string, string>
  onUpdate: (data: Partial<QuestChapter>) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onPickIcon: () => void
  onMoveToGroup: (groupId: string | null) => void
  onClose: () => void
}

export function ChapterSettings({
  open,
  chapter,
  groups,
  textureIndex,
  onUpdate,
  onDelete,
  onMove,
  onPickIcon,
  onMoveToGroup,
  onClose,
}: ChapterSettingsProps) {
  const [sizeInput, setSizeInput] = useState('1.0')

  useEffect(() => {
    if (open) {
      const scalar = (chapter?.default_quest_size?.width || 24) / 24
      setSizeInput((Math.round(scalar * 100) / 100).toFixed(2))
    }
  }, [open, chapter?.id, chapter?.default_quest_size?.width])

  if (!open || !chapter) return null

  const iconUrl = questIconUrl(chapter.icon, textureIndex)

  return (
    <div className="ftb-quest-popup-overlay" onClick={onClose}>
      <div className="ftb-quest-popup" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ftb-popup-header">
          <div className="ftb-popup-header-left">
            <div className="ftb-popup-title">Chapter Settings</div>
          </div>
          <button className="ftb-popup-close" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="ftb-popup-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="ftb-popup-section">
            <div className="ftb-popup-field">
              <label>Title</label>
              <input type="text" value={chapter.title} onChange={(e) => onUpdate({ title: e.target.value })} />
            </div>
            <div className="ftb-popup-field">
              <label>Subtitle</label>
              <input type="text" value={chapter.subtitle || ''} onChange={(e) => onUpdate({ subtitle: e.target.value })} placeholder="Subtitle (optional)" />
            </div>
            <div className="ftb-popup-field">
              <label>Group</label>
              <select value={chapter.group_id || ''} onChange={(e) => onMoveToGroup(e.target.value || null)}>
                <option value="">— No group —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="ftb-popup-field">
              <label>Icon</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, background: 'var(--ftb-input-bg)', border: '1px solid var(--ftb-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', imageRendering: 'pixelated' }}>
                  {iconUrl ? (
                    <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(chapter.icon)} width={24} height={24} alt="" />
                  ) : (
                    <BookIcon size={16} />
                  )}
                </div>
                <button className="ftb-popup-btn" onClick={onPickIcon}>Change Icon</button>
              </div>
            </div>
          </div>

          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Appearance</div>
            <div className="ftb-popup-field">
              <label>Default Quest Shape</label>
              <select value={chapter.default_quest_shape} onChange={(e) => onUpdate({ default_quest_shape: e.target.value })}>
                {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ftb-popup-field">
              <label>Default Quest Size (multiplier)</label>
              <input
                type="number"
                step="0.125"
                min="0.0625"
                max="8"
                value={sizeInput}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setSizeInput(e.target.value)
                  if (!isNaN(v)) {
                    const units = Math.max(1, Math.round(v * 24))
                    onUpdate({ default_quest_size: { width: units, height: units } })
                  }
                }}
              />
            </div>
            <div className="ftb-popup-field">
              <label>Default Min Width</label>
              <input type="number" min="0" max="3000" value={chapter.default_min_width || 0} onChange={(e) => onUpdate({ default_min_width: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="ftb-popup-field">
              <label>Progression Mode</label>
              <select value={chapter.progression_mode} onChange={(e) => onUpdate({ progression_mode: e.target.value })}>
                {CHAPTER_PROGRESSION_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Visibility</div>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.always_invisible} onChange={(e) => onUpdate({ always_invisible: e.target.checked })} />
              <span>Always Invisible</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.default_hide_dependency_lines} onChange={(e) => onUpdate({ default_hide_dependency_lines: e.target.checked })} />
              <span>Default Hide Dependency Lines</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.hide_quest_details_until_startable} onChange={(e) => onUpdate({ hide_quest_details_until_startable: e.target.checked })} />
              <span>Hide Quest Details Until Startable</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.hide_quest_until_deps_visible} onChange={(e) => onUpdate({ hide_quest_until_deps_visible: e.target.checked })} />
              <span>Hide Quest Until Deps Visible</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.hide_quest_until_deps_complete} onChange={(e) => onUpdate({ hide_quest_until_deps_complete: e.target.checked })} />
              <span>Hide Quest Until Deps Complete</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.hide_text_until_complete} onChange={(e) => onUpdate({ hide_text_until_complete: e.target.checked })} />
              <span>Hide Text Until Complete</span>
            </label>
          </div>

          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Misc</div>
            <div className="ftb-popup-field">
              <label>Autofocus Quest ID</label>
              <input type="text" value={chapter.autofocus_id || ''} onChange={(e) => onUpdate({ autofocus_id: e.target.value })} placeholder="Optional quest hex id" />
            </div>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.default_repeatable} onChange={(e) => onUpdate({ default_repeatable: e.target.checked })} />
              <span>Default Repeatable Quests</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.require_sequential_tasks} onChange={(e) => onUpdate({ require_sequential_tasks: e.target.checked })} />
              <span>Require Sequential Tasks</span>
            </label>
            <label className="ftb-popup-checkbox">
              <input type="checkbox" checked={chapter.default_enabled} onChange={(e) => onUpdate({ default_enabled: e.target.checked })} />
              <span>Default Enabled</span>
            </label>
          </div>
        </div>
        <div className="ftb-popup-footer">
          <div className="ftb-popup-footer-left">
            <button className="ftb-popup-btn danger" onClick={onDelete}>Delete Chapter</button>
          </div>
          <div className="ftb-popup-footer-right">
            <button className="ftb-popup-btn" onClick={() => onMove(-1)} title="Move chapter up"><ArrowUpIcon size={12} /> Move Up</button>
            <button className="ftb-popup-btn" onClick={() => onMove(1)} title="Move chapter down"><ArrowDownIcon size={12} /> Move Down</button>
            <button className="ftb-popup-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
