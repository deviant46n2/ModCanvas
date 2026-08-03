import { useState, useEffect } from 'react'
import { ArrowDownIcon, ArrowUpIcon, XIcon } from '../ui/icons'
import type { QuestChapter, QuestChapterGroup } from '../../services/api'

interface GroupSettingsProps {
  open: boolean
  group: QuestChapterGroup
  chapters: QuestChapter[]
  onUpdate: (data: Partial<QuestChapterGroup>) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onMoveChapter: (chapterId: string, groupId: string | null) => void
  onClose: () => void
}

export function GroupSettings({
  open,
  group,
  chapters,
  onUpdate,
  onDelete,
  onMove,
  onMoveChapter,
  onClose,
}: GroupSettingsProps) {
  const [titleInput, setTitleInput] = useState('')

  useEffect(() => {
    if (open && group) setTitleInput(group.title)
  }, [open, group])

  if (!open || !group) return null

  const members = chapters.filter(c => c.group_id === group.id)

  return (
    <div className="ftb-quest-popup-overlay" onClick={onClose}>
      <div className="ftb-quest-popup" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ftb-popup-header">
          <div className="ftb-popup-header-left">
            <div className="ftb-popup-title">Group Settings</div>
          </div>
          <button className="ftb-popup-close" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>
        <div className="ftb-popup-body">
          <div className="ftb-popup-section">
            <div className="ftb-popup-field">
              <label>Title</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => {
                  setTitleInput(e.target.value)
                  onUpdate({ title: e.target.value })
                }}
              />
            </div>
          </div>
          <div className="ftb-popup-section">
            <div className="ftb-popup-section-title">Chapters in this group ({members.length})</div>
            {members.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.6, padding: '4px 0' }}>
                No chapters assigned. Use "Move to Group" on a chapter's settings to add one.
              </div>
            )}
            {members.map(ch => (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <span style={{ flex: 1, fontSize: 12 }}>{ch.title}</span>
                <button className="ftb-popup-btn" style={{ padding: '2px 8px' }} onClick={() => onMoveChapter(ch.id, null)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="ftb-popup-footer">
          <div className="ftb-popup-footer-left">
            <button className="ftb-popup-btn danger" onClick={onDelete}>Delete Group</button>
          </div>
          <div className="ftb-popup-footer-right">
            <button className="ftb-popup-btn" onClick={() => onMove(-1)} title="Move group up"><ArrowUpIcon size={12} /> Move Up</button>
            <button className="ftb-popup-btn" onClick={() => onMove(1)} title="Move group down"><ArrowDownIcon size={12} /> Move Down</button>
            <button className="ftb-popup-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
