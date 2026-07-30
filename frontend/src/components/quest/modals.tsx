
import type { QuestAnalysis, QuestChapterGroup, QuestGraphData } from '../../services/api'
import { PROGRESSION_MODES, SHAPES } from './nodes'

interface ModalsSectionProps {
  showAnalysis: boolean; analysis: QuestAnalysis | null; setShowAnalysis: (v: boolean) => void
  showGroups: boolean; editGroups: QuestChapterGroup[]; setEditGroups: (v: QuestChapterGroup[]) => void; saveGroups: () => void
  showBookSettings: boolean; editBookProgressionMode: string; setEditBookProgressionMode: (v: string) => void
  editBookIcon: string; setEditBookIcon: (v: string) => void; editBookBgImage: string; setEditBookBgImage: (v: string) => void
  editQuestColor: string; setEditQuestColor: (v: string) => void
  editDefaultQuestWidth: number; setEditDefaultQuestWidth: (v: number) => void
  editDefaultQuestHeight: number; setEditDefaultQuestHeight: (v: number) => void
  editDefaultQuestShape: string; setEditDefaultQuestShape: (v: string) => void
  saveBookSettings: () => void; setShowBookSettings: (v: boolean) => void
  showIconPicker: boolean; iconPickerSearch: string; setIconPickerSearch: (v: string) => void
  filteredTextures: [string, string][]; editIcon: string; setEditIcon: (v: string) => void
  setShowIconPicker: (v: boolean) => void; setShowGroups: (v: boolean) => void
  modsDir: string; browseModsDir: () => void; graph: QuestGraphData | null
}

export function ModalsSection({
  showAnalysis, analysis, setShowAnalysis,
  showGroups, editGroups, setEditGroups, saveGroups,
  showBookSettings, editBookProgressionMode, setEditBookProgressionMode,
  editBookIcon, setEditBookIcon, editBookBgImage, setEditBookBgImage,
  editQuestColor, setEditQuestColor,
  editDefaultQuestWidth, setEditDefaultQuestWidth,
  editDefaultQuestHeight, setEditDefaultQuestHeight,
  editDefaultQuestShape, setEditDefaultQuestShape,
  saveBookSettings, setShowBookSettings,
  showIconPicker, iconPickerSearch, setIconPickerSearch,
  filteredTextures, editIcon, setEditIcon,
  setShowIconPicker, setShowGroups,
  modsDir, browseModsDir, // 
}: ModalsSectionProps) {
  return (
    <>
      {showAnalysis && analysis && (
        <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="modal analysis-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Quest Analysis</h2>
            <div className="analysis-grid">
              <div className="analysis-stat"><div className="stat-value">{analysis.total_quests}</div><div className="stat-label">Quests</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_chapters}</div><div className="stat-label">Chapters</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_objectives}</div><div className="stat-label">Objectives</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_rewards}</div><div className="stat-label">Rewards</div></div>
            </div>
            {analysis.issues.length > 0 && (
              <div className="analysis-issues"><h3>Issues</h3>
                {analysis.issues.map((issue: any, i: number) => <div key={i} className={`issue-${issue.severity}`}>{issue.message}</div>)}
              </div>
            )}
            {analysis.chapters.length > 0 && (
              <div className="analysis-section"><h3>Chapters</h3>
                {analysis.chapters.map((ch: any) => <div key={ch.chapter_id} className="chapter-item"><strong>{ch.chapter_label}</strong> — {ch.quest_count} quest{ch.quest_count !== 1 ? 's' : ''}</div>)}
              </div>
            )}
            {analysis.orphaned_quests.length > 0 && (
              <div className="analysis-section"><h3>Orphaned Quests</h3>
                {analysis.orphaned_quests.map((q: any) => <div key={q.quest_id} className="orphan-item">{q.quest_label}</div>)}
              </div>
            )}
            {analysis.incomplete_quests.length > 0 && (
              <div className="analysis-section"><h3>Incomplete Quests</h3>
                {analysis.incomplete_quests.map((q: any) => <div key={q.quest_id} className="incomplete-item"><strong>{q.quest_label}</strong>{q.missing_objectives === 0 && ' — no objectives'}{q.missing_rewards && ' — no rewards'}</div>)}
              </div>
            )}
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setShowAnalysis(false)}>Close</button></div>
          </div>
        </div>
      )}

      {showGroups && (
        <div className="modal-overlay" onClick={() => setShowGroups(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Chapter Groups</h2>
            <div className="groups-list">
              {editGroups.map((g, i) => (
                <div key={g.id} className="group-card">
                  <div className="group-card-header">
                    <span className="group-index">#{i + 1}</span>
                    <button className="btn-remove" onClick={() => setEditGroups(editGroups.filter((_, idx) => idx !== i))}>{'\u00D7'}</button>
                  </div>
                  <div className="inspector-field compact">
                    <label>Title</label>
                    <input type="text" value={g.title} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], title: e.target.value }; setEditGroups(ng) }} />
                  </div>
                  <div className="inspector-field compact">
                    <label>Description</label>
                    <input type="text" value={g.description} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], description: e.target.value }; setEditGroups(ng) }} />
                  </div>
                  <div className="inspector-row">
                    <div className="inspector-field half compact">
                      <label>Icon</label>
                      <input type="text" value={g.icon} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], icon: e.target.value }; setEditGroups(ng) }} />
                    </div>
                    <div className="inspector-field half compact">
                      <label>Order</label>
                      <input type="number" value={g.order_index} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], order_index: Number(e.target.value) }; setEditGroups(ng) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setEditGroups([...editGroups, { id: crypto.randomUUID(), title: 'New Group', description: '', icon: '', order_index: editGroups.length }])}>+ Add Group</button>
              <button className="btn-success" onClick={saveGroups}>Save</button>
              <button className="btn-secondary" onClick={() => setShowGroups(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showBookSettings && (
        <div className="modal-overlay" onClick={() => setShowBookSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Book Settings</h2>
            <div className="inspector-field">
              <label>Book Progression Mode</label>
              <select value={editBookProgressionMode} onChange={(e) => setEditBookProgressionMode(e.target.value)}>
                {PROGRESSION_MODES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="inspector-field">
              <label>Book Icon (item id)</label>
              <input type="text" value={editBookIcon} onChange={(e) => setEditBookIcon(e.target.value)} placeholder="minecraft:book" />
            </div>
            <div className="inspector-field">
              <label>Background Image URL</label>
              <input type="text" value={editBookBgImage} onChange={(e) => setEditBookBgImage(e.target.value)} placeholder="https://..." />
            </div>
            <div className="inspector-row">
              <div className="inspector-field half">
                <label>Quest Color (hex)</label>
                <input type="color" value={editQuestColor || '#3b82f6'} onChange={(e) => setEditQuestColor(e.target.value)} />
              </div>
              <div className="inspector-field half">
                <label>Default Quest Shape</label>
                <select value={editDefaultQuestShape} onChange={(e) => setEditDefaultQuestShape(e.target.value)}>
                  {SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="inspector-row">
              <div className="inspector-field half">
                <label>Default Quest Width</label>
                <input type="number" value={editDefaultQuestWidth} onChange={(e) => setEditDefaultQuestWidth(Number(e.target.value))} />
              </div>
              <div className="inspector-field half">
                <label>Default Quest Height</label>
                <input type="number" value={editDefaultQuestHeight} onChange={(e) => setEditDefaultQuestHeight(Number(e.target.value))} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-success" onClick={saveBookSettings}>Save</button>
              <button className="btn-secondary" onClick={() => setShowBookSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showIconPicker && (
        <div className="modal-overlay" onClick={() => setShowIconPicker(false)}>
          <div className="modal icon-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pick Icon</h2>
            {!modsDir ? (
              <div style={{ padding: '16px 0', color: 'var(--color-text-muted)' }}>
                <p>Set a mods directory first to load textures from .jar files.</p>
                <button className="btn-primary" style={{ marginTop: 8 }} onClick={browseModsDir}>Set Mods Directory</button>
              </div>
            ) : (
              <>
                <div className="inspector-field compact">
                  <input type="text" placeholder="Search textures... (e.g. diamond, minecraft:)" value={iconPickerSearch} onChange={(e) => setIconPickerSearch(e.target.value)} autoFocus />
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  {filteredTextures.length} texture{filteredTextures.length !== 1 ? 's' : ''} found
                </div>
                <div className="icon-picker-grid">
                  {filteredTextures.slice(0, 200).map(([itemId, dataUrl]) => (
                    <button
                      key={itemId}
                      className={`icon-picker-item ${editIcon === itemId ? 'selected' : ''}`}
                      onClick={() => { setEditIcon(itemId); setShowIconPicker(false) }}
                      title={itemId}
                    >
                      <img src={dataUrl} alt={itemId} style={{ width: 32, height: 32, imageRendering: 'pixelated' }} />
                      <span className="icon-picker-label">{itemId.split(':').pop()}</span>
                    </button>
                  ))}
                  {filteredTextures.length > 200 && (
                    <div className="icon-picker-more">+{filteredTextures.length - 200} more (narrow your search)</div>
                  )}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowIconPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}