import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '../ui/icons'

export interface QuestCtxMenuState {
  x: number
  y: number
  mode: 'node' | 'pane'
  nodeId?: string | null
}

interface QuestContextMenuProps {
  menu: QuestCtxMenuState
  simMode: boolean
  selectedCount: number
  hasClipboard: boolean
  onClose: () => void
  onEdit: (nodeId: string) => void
  onRename: (nodeId: string) => void
  onDuplicate: () => void
  onCopyId: () => void
  onDelete: () => void
  onComplete: () => void
  onReset: () => void
  onAddQuest: () => void
  onAddLink: () => void
  onPaste: () => void
  onAddQuestWithTask: (objectiveType: string) => void
  objectiveTypes: Array<{ value: string; label: string }>
}

function Item({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`ctx-menu-item${danger ? ' ctx-menu-item-danger' : ''}${disabled ? ' ctx-menu-item-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}
const Divider = () => <div className="ctx-menu-divider" />
const Group = ({ children }: { children: ReactNode }) => <div className="ctx-menu-group-label">{children}</div>

export function QuestContextMenu({
  menu,
  simMode,
  selectedCount,
  hasClipboard,
  onClose,
  onEdit,
  onRename,
  onDuplicate,
  onCopyId,
  onDelete,
  onComplete,
  onReset,
  onAddQuest,
  onAddLink,
  onPaste,
  onAddQuestWithTask,
  objectiveTypes,
}: QuestContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [showTaskGrid, setShowTaskGrid] = useState(false)

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const doAndClose = (fn: () => void) => () => { fn(); onClose() }

  return (
    <div className="ctx-menu" ref={ref} style={{ left: menu.x, top: menu.y }}>
      {menu.mode === 'node' ? (
        <>
          {selectedCount > 1 && <Group>Editing {selectedCount} quests</Group>}
          {menu.nodeId && <Item label="Edit Quest" onClick={doAndClose(() => onEdit(menu.nodeId!))} />}
          {menu.nodeId && <Item label="Rename" onClick={doAndClose(() => onRename(menu.nodeId!))} />}
          <Item label="Duplicate" onClick={doAndClose(onDuplicate)} />
          <Item label="Copy Quest ID" onClick={doAndClose(onCopyId)} />
          <Divider />
          {simMode && (
            <>
              <Item label="Complete Selected" onClick={doAndClose(onComplete)} />
              <Item label="Reset Selected" onClick={doAndClose(onReset)} />
              <Divider />
            </>
          )}
          <Item label="Delete" onClick={doAndClose(onDelete)} danger />
        </>
      ) : (
        <>
          <Item label="Add Quest" onClick={doAndClose(onAddQuest)} />
          <Item label="Add Quest Link" onClick={doAndClose(onAddLink)} />
          <Divider />
          <Group>New Quest with Task</Group>
          <button
            className="ctx-menu-grid-toggle"
            onClick={() => setShowTaskGrid(g => !g)}
            aria-expanded={showTaskGrid}
          >
            {showTaskGrid ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            <span>{showTaskGrid ? 'Hide task types' : 'Choose task type'}</span>
          </button>
          {showTaskGrid && (
            <div className="ctx-menu-task-grid">
              {objectiveTypes.map(t => (
                <button
                  key={t.value}
                  className="ctx-menu-task-grid-item"
                  onClick={doAndClose(() => onAddQuestWithTask(t.value))}
                  title={t.label}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <Divider />
          <Item label="Paste Quest" onClick={doAndClose(onPaste)} disabled={!hasClipboard} />
        </>
      )}
    </div>
  )
}
