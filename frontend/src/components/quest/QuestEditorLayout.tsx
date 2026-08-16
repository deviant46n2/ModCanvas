import type {
  QuestGraphData,
  QuestNodeData,
  QuestChapter,
  QuestChapterGroup,
  ChapterImage,
  QuestEdgeData,
} from '../../services/api'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/quest-types'
import type { ProgressState } from '../../core/quest/progress'
import type { ToolbarAPI } from './import-export'
import { QuestCanvas } from './QuestCanvas'
import type { ResolvedThemeBackground } from '../../hooks/useQuestAssetPipeline/activity'
import { ChapterTree } from './ChapterTree'
import { QuestDetailModal } from './QuestDetailModal'
import { ChapterSettings } from './ChapterSettings'
import { GroupSettings } from './GroupSettings'
import { ImportExportToolbar } from './import-export'
import { RecipeItemPicker } from '../recipe/RecipeItemPicker'
import { TextureLoadingBar } from './TextureLoadingBar'
import { EngineRenderPrompt } from './EngineRenderPrompt'
import { AnimationProvider } from './animation-context'
import { useChapterIconUrls, useChapterIconKeys, useQuestCounts, useDetailParity } from './quest-editor-selectors'
import './editor-theme-styles'

interface QuestEditorLayoutProps {
  graph: QuestGraphData
  setGraph: (next: QuestGraphData, opts?: { split?: boolean }) => void
  projectId: string
  projectPath?: string
  instancePath: string
  onOpenAssetsFolder: () => void
  packLoaded?: boolean
  wsConnected?: boolean
  isTesting?: boolean
  onTest?: () => void
  onReady: (api: ToolbarAPI) => void
  toolbarApiRef: React.MutableRefObject<ToolbarAPI | null>
  textureIndex: Record<string, string>
  animations: Record<string, string>
  modsDir: string
  setModsDir: (dir: string) => void
  bakedCount: number
  enginePromptDismissed: boolean
  setEnginePromptDismissed: (v: boolean) => void
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getPickerTextureUrl: (itemId: string) => string | null
  questBackground: ResolvedThemeBackground | null
  guiScale: number
  texturesLoading: boolean
  texturesRemaining: number
  collapsedGroups: Record<string, boolean>
  onToggleGroup: (id: string) => void
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  activeChapter: string | null
  onSelectChapter: (id: string) => void
  editChapterId: string | null
  setEditChapterId: (id: string | null) => void
  editGroupId: string | null
  setEditGroupId: (id: string | null) => void
  itemPickerTarget: { type: 'objective' | 'reward'; id: string; nodeId: string } | null
  setItemPickerTarget: (t: { type: 'objective' | 'reward'; id: string; nodeId: string } | null) => void
  simMode: boolean
  setSimMode: (on: boolean) => void
  simProgress: ProgressState
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  onUpdateNodes: (updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => void
  onAddEdge: (edge: { source: string; target: string }) => void
  onUpdateEdge: (edgeId: string, data: { source?: string; target?: string }) => void
  onApplyThemePreset: (presetId: string) => void
  onDeleteNode: (nodeId: string) => void
  onDeleteNodes: (nodeIds: string[]) => void
  onMoveNodesToChapter?: (nodeIds: string[], chapterId: string) => void
  onPasteNodes: (nodes: QuestNodeData[], edges: QuestEdgeData[]) => void
  onDeleteEdge: (edgeId: string) => void
  onAddQuest: (chapterId?: string, position?: { x: number; y: number }, count?: number) => void
  onAddQuestLink: (chapterId?: string, position?: { x: number; y: number }) => void
  onAddQuestWithTask: (chapterId: string, objectiveType: string, position?: { x: number; y: number }) => void
  onUpdateChapterImages: (chapterId: string, images: ChapterImage[]) => void
  onUpdateChapter: (chapterId: string, data: Partial<QuestChapter>) => void
  onDeleteChapter: (chapterId: string) => void
  onMoveChapter: (chapterId: string, dir: -1 | 1) => void
  onAddChapter: () => void
  onAddGroup: () => void
  onUpdateGroup: (groupId: string, data: Partial<QuestChapterGroup>) => void
  onDeleteGroup: (groupId: string) => void
  onAssignChapterToGroup: (chapterId: string, groupId: string | null) => void
  onMoveGroup: (groupId: string, dir: -1 | 1) => void
  onAddObjective: (nodeId: string) => void
  onRemoveObjective: (nodeId: string, objectiveId: string) => void
  onUpdateObjective: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onMoveObjective: (nodeId: string, objectiveId: string, dir: -1 | 1) => void
  onAddReward: (nodeId: string) => void
  onRemoveReward: (nodeId: string, rewardId: string) => void
  onUpdateReward: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  onMoveReward: (nodeId: string, rewardId: string, dir: -1 | 1) => void
  onSetQuestProgress: (questId: string, status: 'started' | 'complete' | null) => void
  onCompleteAll: () => void
  onResetAll: () => void
  /** Open the guided "Add a quest" wizard (P0-MINIWIZ). */
  onOpenGuidedQuest?: () => void
  /** s53 live invitation: visible on first companion connect in Beginner Mode. */
  liveInviteVisible: boolean
  onDismissLiveInvite: () => void
}

export function QuestEditorLayout(props: QuestEditorLayoutProps) {
  const chapterIcons = useChapterIconUrls(props.graph, props.textureIndex)
  const chapterIconKeys = useChapterIconKeys(props.graph)
  const questCounts = useQuestCounts(props.graph)

  const selectedNode = props.selectedNodeId ? props.graph.nodes.find(n => n.id === props.selectedNodeId) : null

  const { shape: selectedShape, locked: selectedLocked } = useDetailParity(selectedNode, props.graph, props.simProgress)

  const pickerTarget = props.itemPickerTarget
  const editChapter = props.editChapterId ? props.graph.chapters.find(c => c.id === props.editChapterId) : null
  const editGroup = props.editGroupId ? props.graph.chapter_groups.find(g => g.id === props.editGroupId) : null

  return (
    <AnimationProvider animations={props.animations}>
      <div className="quest-editor">
        <ImportExportToolbar
        graph={props.graph}
        setGraph={props.setGraph}
        projectId={props.projectId}
        projectPath={props.projectPath}
        textureIndex={props.textureIndex}
        modsDir={props.modsDir}
        setModsDir={props.setModsDir}
        onReady={props.onReady}
        onOpenGuidedQuest={props.onOpenGuidedQuest}
      />
      {props.packLoaded && !!props.instancePath && props.bakedCount > 0 && (!!props.wsConnected || !props.enginePromptDismissed) && (
        <EngineRenderPrompt
          bakedCount={props.bakedCount}
          connected={!!props.wsConnected}
          isTesting={props.isTesting ?? false}
          onRunInstance={() => props.onTest?.()}
          onDismiss={() => props.setEnginePromptDismissed(true)}
        />
      )}
      {props.liveInviteVisible && (
        <div className="live-invite-banner" role="status">
          <span className="live-invite-text">
            Your pack is running — edit your quest book and watch it change in-game.
          </span>
          <button className="btn-primary btn-sm" onClick={props.onOpenGuidedQuest}>
            ✨ Add my first quest
          </button>
          <button
            className="live-invite-dismiss"
            onClick={props.onDismissLiveInvite}
            aria-label="Dismiss live quest invitation"
            title="Dismiss for this session"
          >
            {'\u00D7'}
          </button>
        </div>
      )}
      <div className="quest-editor-body">
        <aside className="quest-editor-chapters" role="navigation" aria-label="Chapters">
          <ChapterTree
            chapters={props.graph.chapters}
            chapterGroups={props.graph.chapter_groups || []}
            activeChapter={props.activeChapter}
            questCounts={questCounts}
            chapterIcons={chapterIcons}
            chapterIconKeys={chapterIconKeys}
            collapsedGroups={props.collapsedGroups}
            onSelectChapter={props.onSelectChapter}
            onToggleGroup={props.onToggleGroup}
            onAddChapter={props.onAddChapter}
            onEditChapter={props.setEditChapterId}
            onAddGroup={props.onAddGroup}
            onEditGroup={props.setEditGroupId}
            onRenameChapter={(id, title) => props.onUpdateChapter(id, { title })}
            onMoveChapter={props.onMoveChapter}
          />
        </aside>
        <main className="quest-editor-canvas">
          <QuestCanvas
            questGraph={props.graph}
            chapters={props.graph.chapters}
            activeChapter={props.activeChapter}
            textureIndex={props.textureIndex}
            onUpdateNode={props.onUpdateNode}
            onUpdateNodes={props.onUpdateNodes}
            onAddEdge={props.onAddEdge}
            onUpdateEdge={props.onUpdateEdge}
            onApplyThemePreset={props.onApplyThemePreset}
            onDeleteNode={props.onDeleteNode}
            onDeleteNodes={props.onDeleteNodes}
            onMoveNodesToChapter={props.onMoveNodesToChapter}
            onPasteNodes={props.onPasteNodes}
            onDeleteEdge={props.onDeleteEdge}
            onAddNode={props.onAddQuest}
            onAddLink={props.onAddQuestLink}
            onAddQuestWithTask={props.onAddQuestWithTask}
            onOpenAssetsFolder={props.onOpenAssetsFolder}
            onUpdateChapterImages={props.onUpdateChapterImages}
            selectedNodeId={props.selectedNodeId}
            setSelectedNodeId={props.setSelectedNodeId}
            questBackground={props.questBackground}
            guiScale={props.guiScale}
            simMode={props.simMode}
            setSimMode={props.setSimMode}
            simProgress={props.simProgress}
            onSetQuestProgress={props.onSetQuestProgress}
            onCompleteAll={props.onCompleteAll}
            onResetAll={props.onResetAll}
            toolbarApiRef={props.toolbarApiRef}
          />
        </main>
        {selectedNode && (
          <QuestDetailModal
            key={selectedNode.id}
            node={selectedNode}
            effectiveShape={selectedShape}
            locked={selectedLocked}
            textureIndex={props.textureIndex}
            onUpdateNode={props.onUpdateNode}
            onDeleteNode={props.onDeleteNode}
            onAddObjective={props.onAddObjective}
            onRemoveObjective={props.onRemoveObjective}
            onUpdateObjective={props.onUpdateObjective}
            onAddReward={props.onAddReward}
            onRemoveReward={props.onRemoveReward}
            onUpdateReward={props.onUpdateReward}
            onMoveObjective={props.onMoveObjective}
            onMoveReward={props.onMoveReward}
            openIconPicker={(target) => props.toolbarApiRef.current?.openIconPicker?.(target)}
            onOpenItemPicker={props.setItemPickerTarget}
            onClose={() => props.setSelectedNodeId(null)}
            simProgress={props.simProgress}
            onSetQuestProgress={props.onSetQuestProgress}
            quests={props.graph.nodes
              .filter((n: QuestNodeData) => n.node_type === 'quest' || n.node_type === 'side_quest')
              .map((n: QuestNodeData) => ({ id: n.id, label: n.label || n.id }))}
            rewardTables={props.graph.reward_tables || []}
          />
        )}
        {pickerTarget && (
          <RecipeItemPicker
            items={props.items}
            tags={props.tags}
            getTextureUrl={props.getPickerTextureUrl}
            onSelect={(value) => {
              const t = pickerTarget
              if (t.type === 'objective') {
                // A tag pick lands in the objective's item_tag field; an
                // item pick in target — matching the FTB data model.
                props.onUpdateObjective(t.nodeId, t.id, value.tag ? 'item_tag' : 'target', value.item)
              } else {
                props.onUpdateReward(t.nodeId, t.id, value.tag ? 'item_tag' : 'item_id', value.item)
              }
              props.setItemPickerTarget(null)
            }}
            onClose={() => props.setItemPickerTarget(null)}
          />
        )}
        {editChapter && (
          <ChapterSettings
            open
            chapter={editChapter}
            groups={props.graph.chapter_groups}
            textureIndex={props.textureIndex}
            onUpdate={(data) => props.onUpdateChapter(editChapter.id, data)}
            onDelete={() => props.onDeleteChapter(editChapter.id)}
            onMove={(dir) => props.onMoveChapter(editChapter.id, dir)}
            onPickIcon={() => props.toolbarApiRef.current?.openIconPicker?.({ type: 'chapter', nodeId: editChapter.id })}
            onMoveToGroup={(groupId) => props.onAssignChapterToGroup(editChapter.id, groupId)}
            onClose={() => props.setEditChapterId(null)}
          />
        )}
        {editGroup && (
          <GroupSettings
            open
            group={editGroup}
            chapters={props.graph.chapters}
            onUpdate={(data) => props.onUpdateGroup(editGroup.id, data)}
            onDelete={() => props.onDeleteGroup(editGroup.id)}
            onMove={(dir) => props.onMoveGroup(editGroup.id, dir)}
            onMoveChapter={(chapterId, groupId) => props.onAssignChapterToGroup(chapterId, groupId)}
            onClose={() => props.setEditGroupId(null)}
          />
        )}
      </div>
      {props.texturesLoading && <TextureLoadingBar remaining={props.texturesRemaining} />}
      </div>
    </AnimationProvider>
  )
}
