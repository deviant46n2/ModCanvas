import type { ReactNode } from 'react'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  LockIcon,
  SquareIcon,
} from '../ui/icons'

export type QuestSectionId = 'appearance' | 'visibility' | 'dependencies' | 'misc'

export const QUEST_SECTIONS: Array<{ id: QuestSectionId; label: string; icon: ReactNode }> = [
  { id: 'appearance', label: 'Appearance', icon: <SquareIcon size={12} /> },
  { id: 'visibility', label: 'Visibility', icon: <LockIcon size={12} /> },
  { id: 'dependencies', label: 'Dependencies', icon: <ArrowRightIcon size={12} /> },
  { id: 'misc', label: 'Misc', icon: <InfoIcon size={12} /> },
]

export function SectionNav({
  openSections,
  onJump,
}: {
  openSections: Partial<Record<QuestSectionId, boolean>>
  onJump: (id: QuestSectionId) => void
}) {
  return (
    <div className="quest-detail-nav" role="tablist" aria-label="Quest settings">
      {QUEST_SECTIONS.map(s => (
        <button
          key={s.id}
          type="button"
          className={`quest-detail-nav-chip${openSections[s.id] ? ' active' : ''}`}
          onClick={() => onJump(s.id)}
        >
          {s.icon}
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  )
}

export function DetailSection({
  id,
  title,
  count,
  icon,
  open,
  onToggle,
  action,
  children,
}: {
  id?: string
  title: string
  count?: number
  icon: ReactNode
  open: boolean
  onToggle: () => void
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="quest-detail-section" id={id}>
      <div
        className="quest-detail-section-header"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <span className="quest-detail-section-icon">{icon}</span>
        <span className="quest-detail-section-title">
          {title}
          {typeof count === 'number' ? ` (${count})` : ''}
        </span>
        <span className="quest-detail-section-chevron">
          {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </span>
        {action && (
          <span className="quest-detail-section-action" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </div>
      {open && <div className="quest-detail-section-body">{children}</div>}
    </section>
  )
}
