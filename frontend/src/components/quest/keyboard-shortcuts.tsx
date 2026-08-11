import { XIcon } from '../ui/icons'

interface ShortcutRow {
  keys: string
  label: string
}

const CANVAS_SHORTCUTS: ShortcutRow[] = [
  { keys: 'Click quest', label: 'Open quest details' },
  { keys: 'Double-click title', label: 'Rename quest inline' },
  { keys: 'Right-click', label: 'Context menu (edit, duplicate, rename, delete)' },
  { keys: 'Arrow keys', label: 'Nudge selected quests (hold Shift for finer steps)' },
  { keys: 'Ctrl+A / Esc', label: 'Select all quests / clear selection' },
  { keys: 'Ctrl+C / Ctrl+V / Ctrl+X', label: 'Copy / paste / cut selected quests' },
  { keys: 'Delete', label: 'Delete selected quest(s)' },
  { keys: 'Ctrl+Z / Ctrl+Y', label: 'Undo / redo' },
  { keys: 'Drag a quest', label: 'Move it (Shift drags free of the grid snap)' },
  { keys: 'Drag from a port', label: 'Create a dependency arrow' },
  { keys: 'Hover a quest', label: 'Light up its dependency fan (cyan in, yellow out)' },
  { keys: 'Drag an arrow endpoint', label: 'Reconnect the dependency to another quest' },
  { keys: 'Double-click a dependency', label: 'Delete the connection' },
]

const EDITOR_SHORTCUTS: ShortcutRow[] = [
  { keys: 'Enter', label: 'Confirm an inline rename' },
  { keys: 'Esc', label: 'Cancel rename or close dialogs' },
  { keys: '?', label: 'Open this shortcut reference' },
  { keys: 'Simulate mode', label: 'Double-click a quest to toggle its completion' },
]

function Row({ row }: { row: ShortcutRow }) {
  return (
    <div className="quest-shortcut-row">
      <kbd className="quest-shortcut-key">{row.keys}</kbd>
      <span className="quest-shortcut-label">{row.label}</span>
    </div>
  )
}

export function KeyboardShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="quest-shortcuts-overlay" onClick={onClose}>
      <div className="quest-shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="quest-shortcuts-header">
          <span className="quest-shortcuts-title">Shortcuts & Gestures</span>
          <button className="quest-shortcuts-close" onClick={onClose} aria-label="Close shortcuts">
            <XIcon size={14} />
          </button>
        </div>
        <div className="quest-shortcuts-body">
          <div className="quest-shortcuts-col">
            <div className="quest-shortcuts-group-title">Canvas</div>
            {CANVAS_SHORTCUTS.map((row, i) => <Row key={i} row={row} />)}
          </div>
          <div className="quest-shortcuts-col">
            <div className="quest-shortcuts-group-title">Editing</div>
            {EDITOR_SHORTCUTS.map((row, i) => <Row key={i} row={row} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
