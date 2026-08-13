// StartChooser — the four-card front door to a new pack (s49). The choice is
// always the user's, on every project start; nothing is keyed to first-run
// detection. Intro and IDE-tour hand off to the wizard with their template
// preset; Blank creates an empty pack straight into the IDE; Load just closes
// (the launcher list is the load surface).

import { BookIcon, ZapIcon, PlusIcon, CheckSquareIcon } from '../ui/icons'

export type StartIntent =
  | { kind: 'intro'; templateId: string }
  | { kind: 'ide-tour'; templateId: string }
  | { kind: 'blank' }
  | { kind: 'load' }

interface StartChooserProps {
  show: boolean
  onPick: (intent: StartIntent) => void
  onClose: () => void
}

const CARD_PADDING = '12px'

function card(active: boolean) {
  return {
    padding: CARD_PADDING,
    border: active ? '2px solid var(--color-accent)' : '1px solid var(--color-border-default)',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'var(--color-bg-surface-1)',
    marginBottom: '8px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  } as const
}

function cardTitle(title: string, desc: string, badge?: string) {
  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
        {title}
        {badge && (
          <span
            style={{
              marginLeft: '8px',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-accent)',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
        {desc}
      </div>
    </>
  )
}

export function StartChooser({ show, onPick, onClose }: StartChooserProps) {
  if (!show) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2>Start a Pack</h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          How would you like to start?
        </div>

        <div style={card(false)} onClick={() => onPick({ kind: 'intro', templateId: 'intro' })}>
          <span className="start-chooser-icon"><BookIcon size={20} /></span>
          <div>{cardTitle('Intro — your first pack in minutes', 'The core loop: add a quest, give it a task, save, and check your pack\'s health. Ends in Beginner Mode.', 'Beginner')}</div>
        </div>

        <div style={card(false)} onClick={() => onPick({ kind: 'ide-tour', templateId: 'ide-tour' })}>
          <span className="start-chooser-icon"><ZapIcon size={20} /></span>
          <div>{cardTitle('IDE Tour — learn every tool', 'A guided walk through the full workbench: quests, recipes, configs, behaviors, loot, mods, health, launch, export. For creators ready for the whole IDE.', 'Full IDE')}</div>
        </div>

        <div style={card(false)} onClick={() => onPick({ kind: 'blank' })}>
          <span className="start-chooser-icon"><PlusIcon size={20} /></span>
          <div>{cardTitle('Blank project', 'Start with an empty pack in the full IDE. No starter content — add quests, recipes, and configs yourself.')}</div>
        </div>

        <div style={card(false)} onClick={() => onPick({ kind: 'load' })}>
          <span className="start-chooser-icon"><CheckSquareIcon size={20} /></span>
          <div>{cardTitle('Load a project', 'Open an existing pack from your list below.')}</div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
