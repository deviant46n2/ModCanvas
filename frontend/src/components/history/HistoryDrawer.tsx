// App-wide history timeline drawer.
//
// Lists every recorded edit across tools in chronological order, marks the
// present point, and supports time-travel: clicking any entry jumps the whole
// workspace to that state (applying the intermediate undo/redo steps in order).
import { useState } from 'react'
import { useHistory } from '../../hooks/history-provider'
import type { CommittedEntry, HistorySubject } from '../../core/history/store'
import './history-drawer.css'

const SUBJECT_LABEL: Record<HistorySubject, string> = {
  graph: 'Quest',
  config: 'Config',
  text: 'Script',
}

function relativeTime(at: number): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function targetName(target: string): string {
  const parts = target.split(/[\\/]/)
  return parts[parts.length - 1] || target
}

export function HistoryDrawer() {
  const history = useHistory()
  const [open, setOpen] = useState(false)
  const { items, present } = history.historyItems

  return (
    <>
      <button
        className="history-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="History (pack-wide undo/redo timeline)"
      >
        <span className="history-trigger-label">History</span>
        {items.length > 0 && <span className="history-trigger-count">{items.length}</span>}
      </button>

      {open && (
        <div className="history-drawer" role="dialog" aria-label="Edit history">
          <div className="history-drawer-header">
            <strong>History</strong>
            <div className="history-drawer-actions">
              <button className="btn-secondary btn-sm" onClick={history.undo} disabled={!history.canUndo}>
                Undo
              </button>
              <button className="btn-secondary btn-sm" onClick={history.redo} disabled={!history.canRedo}>
                Redo
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="history-empty">No edits recorded yet for this pack.</div>
          ) : (
            <ul className="history-list">
              {items.map((entry: CommittedEntry, index) => {
                const applied = index < present
                const isPresentBoundary = index === present - 1
                return (
                  <li key={entry.id}>
                    <button
                      className={`history-entry ${applied ? 'is-applied' : 'is-undone'} ${isPresentBoundary ? 'is-present' : ''}`}
                      onClick={() => history.jumpTo(index + 1)}
                      title="Jump to this point in the timeline"
                    >
                      <span className={`history-subject history-subject--${entry.subject}`}>
                        {SUBJECT_LABEL[entry.subject]}
                      </span>
                      <span className="history-main">
                        <span className="history-label">{entry.label}</span>
                        <span className="history-target">{targetName(entry.target)}</span>
                      </span>
                      <span className="history-meta">
                        <span className="history-time">{relativeTime(entry.at)}</span>
                        {!applied && <span className="history-badge">undone</span>}
                        {isPresentBoundary && <span className="history-badge is-present">now</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </>
  )
}