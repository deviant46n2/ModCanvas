import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react'
import type { Connection, Node, Edge, ReactFlowInstance } from '@xyflow/react'
import {
  getProgressionGraph,
  saveProgressionGraph,
  analyzeProgression,
  autoGenerateProgression,
  scanInstanceTextures,
} from './services/api'
import type {
  ProgressionGraphData,
  ProgressionAnalysis,
} from './services/api'
import ProgressionCanvas from './components/progression/ProgressionCanvas'
import ProgressionToolbar from './components/progression/ProgressionToolbar'
import ProgressionNodeInspector from './components/progression/ProgressionNodeInspector'
import ProgressionAnalysisOverlay from './components/progression/ProgressionAnalysisOverlay'
import { buildVanillaTemplate } from './core/progression/vanilla-template'
import { computePhaseBands } from './core/progression/phase-bands'
import {
  textureDisplayUrl,
  requestMaterialize,
  isTexturePending,
  subscribeMaterialized,
} from './services/texture-loader'
import { FlagIcon } from './components/ui/icons'
import './ProgressionGraph.css'

interface ProgressionGraphProps {
  projectId: string
  instancePath?: string
}

/** Best texture key for a node: explicit `icon` wins, else first `item_refs`
 *  (the vanilla template puts the hero item first), else first `mod_refs`. */
function nodeTextureKey(node: Node): string {
  const d = (node.data as Record<string, unknown>) || {}
  const icon = d.icon as string
  if (icon) return icon
  const items = (d.item_refs as string[]) || []
  if (items.length > 0) return items[0]
  const mods = (d.mod_refs as string[]) || []
  return mods[0] || ''
}

export default function ProgressionGraph({ projectId, instancePath }: ProgressionGraphProps) {
  const [graph, setGraph] = useState<ProgressionGraphData | null>(null)
  const [analysis, setAnalysis] = useState<ProgressionAnalysis | null>(null)
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [textureTick, setTextureTick] = useState(0)
  const [selectedNodeType, setSelectedNodeType] = useState<string>('milestone')
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPhase, setEditPhase] = useState('')
  const [editStageName, setEditStageName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon, setEditIcon] = useState('')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [fitViewKey, setFitViewKey] = useState(0)
  const flowApiRef = useRef<ReactFlowInstance | null>(null)

  // Phase lanes are derived, never persisted: recomputed from real nodes and
  // merged in front of them so they render behind (zIndex -1). They are not
  // selectable or draggable, so user changes never touch them.
  const bandNodes = useMemo(() => {
    return computePhaseBands(nodes).map((b) => ({
      id: b.id,
      type: 'phaseBand',
      position: { x: b.x, y: b.y },
      data: { phase: b.phase, color: b.color, width: b.width, height: b.height, count: b.count },
      selectable: false,
      draggable: false,
      zIndex: -1,
    }))
  }, [nodes])

  const visibleNodes = useMemo(() => {
    const enriched = nodes.map((n) => {
      const key = nodeTextureKey(n)
      return {
        ...n,
        data: {
          ...(n.data as Record<string, unknown>),
          textureKey: key,
          textureUrl: key ? textureDisplayUrl(textureIndex, key) : undefined,
        },
      }
    })
    return [...bandNodes, ...enriched]
  }, [bandNodes, nodes, textureIndex])

  const toRfNodes = useCallback((graph: ProgressionGraphData): Node[] => {
    return graph.nodes.map((n) => {
      // The backend's ProgressionNode only persists a `data` map; read the
      // extra UI fields from the top level if present, else from `data`.
      const d = n.data || {}
      const icon = n.icon || d.icon || ''
      const color = n.color || d.color || ''
      const phase = n.phase || d.phase || ''
      const stage_name = n.stage_name || d.stage_name || ''
      const chapter_id = n.chapter_id || d.chapter_id || null
      const item_refs = n.item_refs?.length ? n.item_refs : (d.item_refs ? JSON.parse(d.item_refs) : [])
      const mod_refs = n.mod_refs?.length ? n.mod_refs : (d.mod_refs ? JSON.parse(d.mod_refs) : [])
      return {
        id: n.id,
        type: n.node_type,
        position: n.position,
        data: {
          label: n.label,
          description: n.description,
          nodeType: n.node_type,
          mod_refs,
          item_refs,
          chapter_id,
          phase,
          stage_name,
          icon,
          color,
        },
      }
    })
  }, [])

  const toRfEdges = useCallback((graph: ProgressionGraphData): Edge[] => {
    return graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: 'smoothstep',
      animated: e.edge_type === 'optional',
      markerEnd: { type: MarkerType.ArrowClosed },
    }))
  }, [])

  const loadGraph = useCallback(async () => {
    try {
      const graph = await getProgressionGraph(projectId)
      setGraph(graph)
      setNodes(toRfNodes(graph))
      setEdges(toRfEdges(graph))
      setFitViewKey((k) => k + 1)
    } catch (e) {
      console.error('Failed to load progression graph:', e)
    }
  }, [projectId, setNodes, setEdges, toRfNodes, toRfEdges])

  const saveGraph = useCallback(async () => {
    if (!graph) return
    const updatedGraph: ProgressionGraphData = {
      ...graph,
      nodes: nodes.map((n) => {
        const data = (n.data as Record<string, unknown>) || {}
        // Stash UI-only fields in `data` so the backend round-trip keeps them.
        const stash: Record<string, string> = {
          icon: (data.icon as string) || '',
          color: (data.color as string) || '',
          phase: (data.phase as string) || '',
          stage_name: (data.stage_name as string) || '',
          chapter_id: (data.chapter_id as string) || '',
        }
        if (Array.isArray(data.item_refs)) stash.item_refs = JSON.stringify(data.item_refs)
        if (Array.isArray(data.mod_refs)) stash.mod_refs = JSON.stringify(data.mod_refs)
        return {
          id: n.id,
          node_type: (data.nodeType as string) || 'milestone',
          label: (data.label as string) || 'New Node',
          description: (data.description as string) || '',
          position: n.position,
          data: stash,
          mod_refs: (data.mod_refs as string[]) || [],
          item_refs: (data.item_refs as string[]) || [],
          chapter_id: (data.chapter_id as string) || null,
          phase: (data.phase as string) || '',
          stage_name: (data.stage_name as string) || '',
          icon: (data.icon as string) || '',
          color: (data.color as string) || '',
        }
      }),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | null,
        edge_type: 'prerequisite',
      })),
    }
    try {
      await saveProgressionGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
    } catch (e) {
      console.error('Failed to save progression graph:', e)
    }
  }, [graph, nodes, edges, projectId])

  const loadAnalysis = useCallback(async () => {
    try {
      const analysis = await analyzeProgression(projectId)
      setAnalysis(analysis)
      setShowAnalysis(true)
    } catch (e) {
      console.error('Failed to load analysis:', e)
    }
  }, [projectId])

  const autoGenerate = useCallback(async () => {
    try {
      const graph = await autoGenerateProgression(projectId)
      setGraph(graph)
      setNodes(toRfNodes(graph))
      setEdges(toRfEdges(graph))
      setSelectedNode(null)
      setFitViewKey((k) => k + 1)
    } catch (e) {
      console.error('Failed to load progression from pack:', e)
    }
  }, [projectId, setNodes, setEdges, toRfNodes, toRfEdges])

  const loadVanillaTemplate = useCallback(() => {
    const graph = buildVanillaTemplate(projectId)
    setGraph(graph)
    setNodes(toRfNodes(graph))
    setEdges(toRfEdges(graph))
    setSelectedNode(null)
    setFitViewKey((k) => k + 1)
  }, [projectId, setNodes, setEdges, toRfNodes, toRfEdges])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
      )
      setTimeout(saveGraph, 100)
    },
    [setEdges, saveGraph]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setEditLabel((node.data?.label as string) || '')
    setEditDesc((node.data?.description as string) || '')
    setEditPhase((node.data?.phase as string) || '')
    setEditStageName((node.data?.stage_name as string) || '')
    setEditColor((node.data?.color as string) || '')
    setEditIcon((node.data?.icon as string) || '')
  }, [])

  const onPaneClick = useCallback(() => { setSelectedNode(null) }, [])

  const handleDeleteEdge = useCallback((edge: Edge) => {
    setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    setTimeout(saveGraph, 100)
  }, [setEdges, saveGraph])

  const updateSelectedNode = useCallback(() => {
    if (!selectedNode) return
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                label: editLabel,
                description: editDesc,
                phase: editPhase,
                stage_name: editStageName,
                color: editColor,
                icon: editIcon,
              },
            }
          : n
      )
    )
    setSelectedNode(null)
    setTimeout(saveGraph, 100)
  }, [selectedNode, editLabel, editDesc, editPhase, editStageName, editColor, editIcon, setNodes, saveGraph])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
    setTimeout(saveGraph, 100)
  }, [selectedNode, setNodes, setEdges, saveGraph])

  const addNode = useCallback(
    (type: string) => {
      const id = crypto.randomUUID()
      // Spawn where the user is looking: viewport center → flow coords.
      const center = flowApiRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const position = center
        ? { x: center.x - 88, y: center.y - 40 }
        : { x: 200 + Math.random() * 400, y: nodes.length * 120 }
      const newNode: Node = {
        id,
        type,
        position,
        data: {
          label: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          description: '',
          nodeType: type,
          mod_refs: [],
          item_refs: [],
          chapter_id: null,
          phase: '',
          stage_name: '',
          icon: '',
          color: '',
        },
      }
      setNodes((nds) => [...nds, newNode])
      setTimeout(saveGraph, 100)
    },
    [nodes.length, setNodes, saveGraph]
  )

  useMemo(() => { loadGraph() }, [loadGraph])

  // Textures: scan the instance index once, then re-render whenever the lazy
  // materializer lands new data URLs (same pattern as the quest editor).
  useEffect(() => {
    if (!instancePath) return
    let cancelled = false
    scanInstanceTextures(instancePath).then((idx) => {
      if (cancelled || !idx || Object.keys(idx).length === 0) return
      setTextureIndex(prev => ({ ...prev, ...idx }))
      setTextureTick(t => t + 1)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [instancePath])

  useEffect(() => {
    let pending = false
    const schedule = () => {
      if (pending) return
      pending = true
      setTimeout(() => { pending = false; setTextureTick(t => t + 1) }, 0)
    }
    const unsub = subscribeMaterialized(schedule)
    return unsub
  }, [])

  // Request lazy materialization for any node key that is pending (in the
  // index but not yet a displayable URL). Runs on graph load + tick.
  useEffect(() => {
    if (!instancePath) return
    const targets = visibleNodes
      .filter((n) => n.type !== 'phaseBand')
      .map(nodeTextureKey)
      .filter((k) => !!k && isTexturePending(textureIndex, k))
    if (targets.length > 0) requestMaterialize(targets, instancePath)
  }, [textureTick, visibleNodes, textureIndex, instancePath])

  const modRefs = (selectedNode?.data?.mod_refs as string[]) || []

  return (
    <div className="progression-panel">
      <ProgressionToolbar
        selectedNodeType={selectedNodeType}
        setSelectedNodeType={setSelectedNodeType}
        onAddNode={() => addNode(selectedNodeType)}
        onAutoGenerate={autoGenerate}
        onVanillaTemplate={loadVanillaTemplate}
        onSave={saveGraph}
        onAnalyze={loadAnalysis}
      />
      <div className="progression-layout">
        {nodes.length === 0 ? (
          <div className="progression-empty">
            <div className="progression-empty-icon"><FlagIcon size={44} /></div>
            <h3>Plan your pack's progression</h3>
            <p>
              Map milestones, unlocks, and phases into a dependency graph. Start from the vanilla
              template — a hand-crafted journey across all five advancement tabs — or generate one
              from this pack's mods.
            </p>
            <div className="progression-empty-actions">
              <button className="btn-primary" onClick={loadVanillaTemplate}>Load Vanilla Template</button>
              <button className="btn-secondary" onClick={autoGenerate}>Load from Pack</button>
            </div>
          </div>
        ) : (
          <>
            <div className="progression-canvas">
              <ProgressionCanvas
                nodes={visibleNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDeleteEdge={handleDeleteEdge}
                fitViewKey={fitViewKey}
                onFlowReady={(api) => { flowApiRef.current = api }}
              />
            </div>
            {selectedNode && (
          <ProgressionNodeInspector
            selectedNode={selectedNode}
            graph={graph}
            editLabel={editLabel}
            editDesc={editDesc}
            editPhase={editPhase}
            editStageName={editStageName}
            editColor={editColor}
            editIcon={editIcon}
            modRefs={modRefs}
            onSetEditLabel={setEditLabel}
            onSetEditDesc={setEditDesc}
            onSetEditPhase={setEditPhase}
            onSetEditStageName={setEditStageName}
            onSetEditColor={setEditColor}
            onSetEditIcon={setEditIcon}
            onClose={() => setSelectedNode(null)}
            onApply={updateSelectedNode}
            onDelete={deleteSelectedNode}
          />
          )}
          </>
        )}
      </div>
      {showAnalysis && analysis && (
        <ProgressionAnalysisOverlay analysis={analysis} onClose={() => setShowAnalysis(false)} />
      )}
    </div>
  )
}
