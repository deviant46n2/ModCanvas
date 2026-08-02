import React, { useCallback, useMemo, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '../QuestGraph.css'
import '../components/QuestTile.css'
import { QuestTileComponent } from './components/QuestTile'
import type { QuestGraphProps } from './components/quest/nodes'
import { ToolbarSection } from './components/quest/toolbar'
import { CanvasSection } from './components/quest/canvas'
import { InspectorSection } from './components/quest/inspector'
import { ModalsSection } from './components/quest/modals'
import { useGraphData } from './hooks/useGraphData'
import { useGraphUI } from './hooks/useGraphUI'
import { useGraphActions } from './hooks/useGraphActions'

export default function QuestGraph({ projectId, projectPath }: QuestGraphProps) {
  const data = useGraphData(projectId, projectPath)
  const ui = useGraphUI({
    graph: data.graph, setGraph: data.setGraph,
    nodes: data.nodes, setNodes: data.setNodes,
    edges: data.edges, setEdges: data.setEdges,
    saveGraph: data.saveGraph, textureIndex: data.textureIndex,
    toRfNodesCb: data.toRfNodesCb, projectId,
    activeChapter: data.activeChapter, setActiveChapter: data.setActiveChapter,
  })
  const actions = useGraphActions({
    graph: data.graph, nodes: data.nodes, setNodes: data.setNodes,
    edges: data.edges, setEdges: data.setEdges,
    toRfNodesCb: data.toRfNodesCb, textureIndex: data.textureIndex,
    projectId, activeChapter: data.activeChapter,
    selectedNodeId: ui.selectedNodeId, selectedNode: ui.selectedNode,
    deselectNode: ui.deselectNode, setSelectedNodeId: ui.setSelectedNodeId,
    saveGraph: data.saveGraph, setGraph: data.setGraph,
  })

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const nodeTypes = useMemo(() => ({
    chapter: QuestTileComponent, quest: QuestTileComponent,
    reward: QuestTileComponent, gate: QuestTileComponent,
    side_quest: QuestTileComponent,
  }), [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => ui.selectNode(node), [ui.selectNode])
  const onPaneClick = useCallback(() => ui.deselectNode(), [ui.deselectNode])
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault(); ui.selectNode(node)
    actions.setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
  }, [ui.selectNode, actions.setContextMenu])
  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault()
    actions.setContextMenu({ x: (e as any).clientX, y: (e as any).clientY })
  }, [actions.setContextMenu])
  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (confirm('Delete this connection?')) {
      data.setEdges((eds) => eds.filter((e) => e.id !== edge.id))
      setTimeout(data.saveGraph, 100)
    }
  }, [data.setEdges, data.saveGraph])

  const edit = {
    label: ui.editState.label[0], setLabel: ui.editState.label[1],
    desc: ui.editState.desc[0], setDesc: ui.editState.desc[1],
    subtitle: ui.editState.subtitle[0], setSubtitle: ui.editState.subtitle[1],
    color: ui.editState.color[0], setColor: ui.editState.color[1],
    visibility: ui.editState.visibility[0], setVisibility: ui.editState.visibility[1],
    optional: ui.editState.optional[0], setOptional: ui.editState.optional[1],
    icon: ui.editState.icon[0], setIcon: ui.editState.icon[1],
    repeatable: ui.editState.repeatable[0], setRepeatable: ui.editState.repeatable[1],
    silentComplete: ui.editState.silentComplete[0], setSilentComplete: ui.editState.silentComplete[1],
    repeatTime: ui.editState.repeatTime[0], setRepeatTime: ui.editState.repeatTime[1],
    repeatMinDelay: ui.editState.repeatMinDelay[0], setRepeatMinDelay: ui.editState.repeatMinDelay[1],
    repeatMaxDelay: ui.editState.repeatMaxDelay[0], setRepeatMaxDelay: ui.editState.repeatMaxDelay[1],
    hideDeps: ui.editState.hideDeps[0], setHideDeps: ui.editState.hideDeps[1],
    hideQuest: ui.editState.hideQuest[0], setHideQuest: ui.editState.hideQuest[1],
    hideAll: ui.editState.hideAll[0], setHideAll: ui.editState.hideAll[1],
    disableReward: ui.editState.disableReward[0], setDisableReward: ui.editState.disableReward[1],
    pauseReward: ui.editState.pauseReward[0], setPauseReward: ui.editState.pauseReward[1],
    shape: ui.editState.shape[0], setShape: ui.editState.shape[1],
    iconScaling: ui.editState.iconScaling[0], setIconScaling: ui.editState.iconScaling[1],
    tags: ui.editState.tags[0], setTags: ui.editState.tags[1],
    progressionMode: ui.editState.progressionMode[0], setProgressionMode: ui.editState.progressionMode[1],
    sequentialTasks: ui.editState.sequentialTasks[0], setSequentialTasks: ui.editState.sequentialTasks[1],
    disableToast: ui.editState.disableToast[0], setDisableToast: ui.editState.disableToast[1],
    ignoreRewardBlocking: ui.editState.ignoreRewardBlocking[0], setIgnoreRewardBlocking: ui.editState.ignoreRewardBlocking[1],
    disableJei: ui.editState.disableJei[0], setDisableJei: ui.editState.disableJei[1],
    hideDetailsUntilStartable: ui.editState.hideDetailsUntilStartable[0], setHideDetailsUntilStartable: ui.editState.hideDetailsUntilStartable[1],
    hideTextUntilCompleted: ui.editState.hideTextUntilCompleted[0], setHideTextUntilCompleted: ui.editState.hideTextUntilCompleted[1],
    invisibleUntilCompleted: ui.editState.invisibleUntilCompleted[0], setInvisibleUntilCompleted: ui.editState.invisibleUntilCompleted[1],
    invisibleUntilXTasks: ui.editState.invisibleUntilXTasks[0], setInvisibleUntilXTasks: ui.editState.invisibleUntilXTasks[1],
    hideDepLines: ui.editState.hideDepLines[0], setHideDepLines: ui.editState.hideDepLines[1],
    hideDeptLines: ui.editState.hideDeptLines[0], setHideDeptLines: ui.editState.hideDeptLines[1],
    minReqDeps: ui.editState.minReqDeps[0], setMinReqDeps: ui.editState.minReqDeps[1],
    depRequirement: ui.editState.depRequirement[0], setDepRequirement: ui.editState.depRequirement[1],
  }

  return (
    <div className="quest-editor">
      <ToolbarSection
        autoGenerate={data.autoGenerate}
        exportFtbQuests={data.exportFtbQuests}
        createQuestAtCursor={actions.createQuestAtCursor}
        saveGraph={data.saveGraph}
        loadAnalysis={ui.loadAnalysis}
        browseModsDir={data.browseModsDir}
        modsDir={data.modsDir}
        textureCount={Object.keys(data.textureIndex).length}
        openBookSettings={ui.openBookSettings}
        onOpenGroups={ui.openGroups}
      />
      <div className="quest-editor-layout">
        <CanvasSection
          filteredNodes={data.filteredNodes}
          filteredEdges={data.filteredEdges}
          onNodesChange={data.onNodesChange}
          onEdgesChange={data.onEdgesChange}
          onConnect={data.onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          setViewportPos={actions.setViewportPos}
          graph={data.graph}
          activeChapter={data.activeChapter}
          setActiveChapter={data.setActiveChapter}
          chapterQuestCounts={data.chapterQuestCounts}
          collapsedGroups={collapsedGroups}
          setCollapsedGroups={setCollapsedGroups}
          addChapter={ui.addChapter}
          textureIndex={data.textureIndex}
          contextMenu={actions.contextMenu}
          closeContextMenu={actions.closeContextMenu}
          selectNode={ui.selectNode}
          clipboard={actions.clipboard}
          setClipboard={actions.setClipboard}
          pasteNode={actions.pasteNode}
          deleteNodeById={actions.deleteNodeById}
          createQuestAtCursor={actions.createQuestAtCursor}
          nodes={data.nodes}
          onEdgeDoubleClick={onEdgeDoubleClick}
          viewportPos={actions.viewportPos}
          selectedNodeId={ui.selectedNodeId}
          selectedLabel={ui.selectedLabel}
        />
        <InspectorSection
          selectedNode={ui.selectedNode}
          selectedNodeType={ui.selectedNodeType}
          selectedLabel={ui.selectedLabel}
          selectedIconDataUrl={ui.selectedIconDataUrl}
          isQuestSelected={ui.isQuestSelected}
          selectedFallbackIcon={ui.selectedFallbackIcon}
          inspectorTab={ui.inspectorTab}
          setInspectorTab={(tab: string) => ui.setInspectorTab(tab as any)}
          deselectNode={ui.deselectNode}
          deleteSelectedNode={actions.deleteSelectedNode}
          openIconPicker={data.openIconPicker}
          liveSaveField={ui.liveSaveField}
          edit={edit}
          inspectorObjectives={ui.inspectorObjectives}
          inspectorRewards={ui.inspectorRewards}
          updateInspectorObjective={ui.updateInspectorObjective}
          removeInspectorObjective={ui.removeInspectorObjective}
          addInspectorObjective={ui.addInspectorObjective}
          updateInspectorReward={ui.updateInspectorReward}
          removeInspectorReward={ui.removeInspectorReward}
          addInspectorReward={ui.addInspectorReward}
          rewardTables={data.graph?.reward_tables || []}
          textureIndex={data.textureIndex}
        />
      </div>
      <ModalsSection
        showAnalysis={ui.showAnalysis}
        analysis={ui.analysis}
        setShowAnalysis={ui.setShowAnalysis}
        showGroups={ui.showGroups}
        editGroups={ui.editGroups}
        setEditGroups={ui.setEditGroups}
        saveGroups={ui.saveGroups}
        showBookSettings={ui.showBookSettings}
        editBookProgressionMode={ui.editBookProgressionMode}
        setEditBookProgressionMode={ui.setEditBookProgressionMode}
        editBookIcon={ui.editBookIcon}
        setEditBookIcon={ui.setEditBookIcon}
        editBookBgImage={ui.editBookBgImage}
        setEditBookBgImage={ui.setEditBookBgImage}
        editQuestColor={ui.editQuestColor}
        setEditQuestColor={ui.setEditQuestColor}
        editDefaultQuestWidth={ui.editDefaultQuestWidth}
        setEditDefaultQuestWidth={ui.setEditDefaultQuestWidth}
        editDefaultQuestHeight={ui.editDefaultQuestHeight}
        setEditDefaultQuestHeight={ui.setEditDefaultQuestHeight}
        editDefaultQuestShape={ui.editDefaultQuestShape}
        setEditDefaultQuestShape={ui.setEditDefaultQuestShape}
        saveBookSettings={ui.saveBookSettings}
        setShowBookSettings={ui.setShowBookSettings}
        showIconPicker={data.showIconPicker}
        iconPickerSearch={data.iconPickerSearch}
        setIconPickerSearch={data.setIconPickerSearch}
        filteredTextures={data.filteredTextures}
        editIcon={ui.editIcon}
        setEditIcon={ui.setEditIcon}
        setShowIconPicker={data.setShowIconPicker}
        setShowGroups={ui.setShowGroups}
        modsDir={data.modsDir}
        browseModsDir={data.browseModsDir}
        graph={data.graph}
      />
    </div>
  )
}
