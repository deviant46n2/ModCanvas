// Quest book editor toolbar: texture indexing, FTB Quests import, book-level
// settings, reward tables, and save / hot-reload. Persistence and import side
// effects live in useQuestToolbarActions; this file only wires presentation.
import { useState, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { QuestGraphData } from '../../services/api'
import { IconPicker } from './icon-picker'
import { BookSettings } from './book-settings'
import { RewardTablesModal } from './RewardTablesModal'
import { ImportMenu } from './import-menu'
import { useQuestToolbarActions } from './quest-toolbar-actions'
import { pickDir } from './pick-dir'
import { SearchIcon, RefreshIcon, SettingsIcon, TrophyIcon, TagIcon } from '../ui/icons'

export interface ToolbarAPI {
  scheduleAutoSave: () => void
  openIconPicker: (target: { type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book'; index?: number; nodeId?: string }) => void
}

type IconPickerTarget = Parameters<ToolbarAPI['openIconPicker']>[0]

interface ImportExportToolbarProps {
  graph: QuestGraphData
  setGraph: (g: QuestGraphData) => void
  projectId: string
  projectPath?: string
  textureIndex: Record<string, string>
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
  modsDir: string
  setModsDir: (dir: string) => void
  onReady: (api: ToolbarAPI) => void
}

export function ImportExportToolbar({
  graph, setGraph, projectId, projectPath,
  textureIndex, setTextureIndex, modsDir, setModsDir, onReady,
}: ImportExportToolbarProps) {
  const [iconPickerState, setIconPickerState] = useState<{ open: boolean; target: IconPickerTarget | null }>({ open: false, target: null })
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [showRewardTables, setShowRewardTables] = useState(false)

  const {
    saveMessage, saveNow, saveAndHotReload, scheduleAutoSave, wsStatus,
    browseModsDir, handleImportFtb, handleImportFromPrism, handleBrowseOther,
    handleReIndex, loadPrismList, prismInstances, prismLoading,
  } = useQuestToolbarActions({
    graph, setGraph, projectId, projectPath,
    textureIndex, setTextureIndex, modsDir, setModsDir,
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
          <button className="book-btn" onClick={browseModsDir} title="Scan mod jar / KubeJS textures into the index">
            <SearchIcon size={14} /> Textures
          </button>
          <button className="book-btn" onClick={handleReIndex} title="Force a full texture re-index and quest re-import">
            <RefreshIcon size={14} /> Re-Index
          </button>
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
        textureIndex={textureIndex}
        onTextureIndexChange={setTextureIndex}
        onClose={() => setShowBookSettings(false)}
        onSave={saveNow}
        pickDir={pickDir}
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
