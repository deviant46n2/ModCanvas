// Quest book editor toolbar: texture indexing, FTB Quests import, book-level
// settings, reward tables, and save / hot-reload. Persistence and import side
// effects live in useQuestToolbarActions; this file only wires presentation.
import { useState, useCallback, useEffect } from 'react'
import type { QuestGraphData } from '../../services/api'
import { IconPicker } from './icon-picker'
import { BookSettings } from './book-settings'
import { RewardTablesModal } from './RewardTablesModal'
import { ImportMenu } from './import-menu'
import { useQuestToolbarActions } from '../../hooks/useQuestToolbarActions'
import { pickDir } from './pick-dir'
import { TagIcon, SettingsIcon, TrophyIcon } from '../ui/icons'

export interface ToolbarAPI {
  /** Populated by the toolbar; consumers always optional-chain (the api
   *  legitimately starts life without members until each owner mounts). */
  scheduleAutoSave?: () => void
  openIconPicker?: (target: { type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book'; index?: number; nodeId?: string }) => void
  /** Spawn position for surfaces outside <ReactFlow> (the guided-quest
   *  wizard): the visible pane center in FTB grid coords, or null when the
   *  canvas isn't laid out yet. Populated by QuestCanvas (s49-followup). */
  getSpawnGridPos?: () => { x: number; y: number } | null
  /** Animated fitView to a node so a just-created quest is revealed. */
  focusNode?: (nodeId: string) => void
}

type IconPickerTarget = Parameters<NonNullable<ToolbarAPI['openIconPicker']>>[0]

interface ImportExportToolbarProps {
  graph: QuestGraphData
  setGraph: (g: QuestGraphData) => void
  projectId: string
  projectPath?: string
  textureIndex: Record<string, string>
  modsDir: string
  setModsDir: (dir: string) => void
  onReady: (api: ToolbarAPI) => void
  /** Open the guided "Add a quest" wizard (P0-MINIWIZ). */
  onOpenGuidedQuest?: () => void
}

export function ImportExportToolbar({
  graph, setGraph, projectId, projectPath,
  textureIndex, modsDir, setModsDir, onReady, onOpenGuidedQuest,
}: ImportExportToolbarProps) {
  const [iconPickerState, setIconPickerState] = useState<{ open: boolean; target: IconPickerTarget | null }>({ open: false, target: null })
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [showRewardTables, setShowRewardTables] = useState(false)

  const {
    saveMessage, saveNow, saveAndHotReload, scheduleAutoSave, wsStatus,
    handleImportFtb, handleImportFromPrism, handleBrowseOther,
    loadPrismList, prismInstances, prismLoading,
  } = useQuestToolbarActions({
    graph, setGraph, projectId, projectPath,
    textureIndex, modsDir,
  })

  const openIconPicker = useCallback((target: IconPickerTarget) => {
    setIconPickerState({ open: true, target })
  }, [])

  useEffect(() => {
    onReady({ scheduleAutoSave, openIconPicker })
  }, [onReady, scheduleAutoSave, openIconPicker])

  const saveLabel = wsStatus.connected ? 'Save' : 'Save (Offline)'

  return (
    <>
      <header className="quest-editor-toolbar">
        <div className="quest-editor-toolbar-left">
          <span className="quest-editor-title">{graph.name || 'Quest Book'}</span>
          <ImportMenu
            instances={prismInstances}
            loading={prismLoading}
            onImportProject={handleImportFtb}
            onImportPrism={handleImportFromPrism}
            onBrowseOther={handleBrowseOther}
            onLoadInstances={loadPrismList}
          />
          <button className="book-btn" onClick={() => setShowBookSettings(true)}>
            <SettingsIcon size={14} /> Book Settings
          </button>
          <button className="book-btn" onClick={() => setShowRewardTables(true)} title="Edit weighted reward tables">
            <TrophyIcon size={14} /> Rewards
          </button>
          {onOpenGuidedQuest && (
            <button className="book-btn" onClick={onOpenGuidedQuest} title="Guided quest — pick an item and a goal, the wizard writes the quest">
              ✨ Add a quest
            </button>
          )}
        </div>
        <div className="quest-editor-toolbar-right">
          <span className="quest-toolbar-texture-count" title="Loaded textures">
            <TagIcon size={12} />
            {Object.keys(textureIndex).length}
          </span>
          <button
            className="book-btn primary"
            onClick={saveAndHotReload}
            title={wsStatus.connected
              ? 'Save, export to FTB Quests, and hot-reload into the running game'
              : 'Save and export to FTB Quests (no game connected — reconnects and hot-reloads on demand)'}
          >
            {saveLabel}
          </button>
          {saveMessage && (
            <span className="quest-toolbar-save-message" data-ok={saveMessage.ok}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </header>

      <IconPicker
        open={iconPickerState.open}
        target={iconPickerState.target}
        textureIndex={textureIndex}
        graph={graph}
        instancePath={projectPath || ''}
        onGraphChange={setGraph}
        onClose={() => setIconPickerState({ open: false, target: null })}
        scheduleAutoSave={scheduleAutoSave}
      />

      <BookSettings
        open={showBookSettings}
        graph={graph}
        onGraphChange={setGraph}
        modsDir={modsDir}
        onModsDirChange={setModsDir}
        onClose={() => setShowBookSettings(false)}
        onSave={saveNow}
        pickDir={pickDir}
        openIconPicker={openIconPicker}
        textureIndex={textureIndex}
      />

      <RewardTablesModal
        open={showRewardTables}
        graph={graph}
        textureIndex={textureIndex}
        onGraphChange={(g) => { setGraph(g); scheduleAutoSave() }}
        onClose={() => setShowRewardTables(false)}
      />
    </>
  )
}
