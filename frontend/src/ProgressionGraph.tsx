import { useCallback, useState, useMemo } from 'react'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react'
import type { Connection, Node, Edge } from '@xyflow/react'
import {
  getProgressionGraph,
  saveProgressionGraph,
  analyzeProgression,
  autoGenerateProgression,
} from './services/api'
import type {
  ProgressionGraphData,
  ProgressionAnalysis,
} from './services/api'
import ProgressionCanvas from './components/progression/ProgressionCanvas'
import ProgressionToolbar from './components/progression/ProgressionToolbar'
import ProgressionNodeInspector from './components/progression/ProgressionNodeInspector'
import ProgressionAnalysisOverlay from './components/progression/ProgressionAnalysisOverlay'

interface ProgressionGraphProps {
  projectId: string
}

export default function ProgressionGraph({ projectId }: ProgressionGraphProps) {
  const [graph, setGraph] = useState<ProgressionGraphData | null>(null)
  const [analysis, setAnalysis] = useState<ProgressionAnalysis | null>(null)
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

  const toRfNodes = useCallback((graph: ProgressionGraphData): Node[] => {
    return graph.nodes.map((n) => ({
      id: n.id,
      type: n.node_type,
      position: n.position,
      data: {
        label: n.label,
        description: n.description,
        nodeType: n.node_type,
        mod_refs: n.mod_refs,
        item_refs: n.item_refs,
        chapter_id: n.chapter_id,
        phase: n.phase,
        stage_name: n.stage_name,
        icon: n.icon,
        color: n.color,
      },
    }))
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
    } catch (e) {
      console.error('Failed to load progression graph:', e)
    }
  }, [projectId, setNodes, setEdges, toRfNodes, toRfEdges])

  const saveGraph = useCallback(async () => {
    if (!graph) return
    const updatedGraph: ProgressionGraphData = {
      ...graph,
      nodes: nodes.map((n) => ({
        id: n.id,
        node_type: (n.data?.nodeType as string) || 'milestone',
        label: (n.data?.label as string) || 'New Node',
        description: (n.data?.description as string) || '',
        position: n.position,
        data: {},
        mod_refs: (n.data?.mod_refs as string[]) || [],
        item_refs: (n.data?.item_refs as string[]) || [],
        chapter_id: (n.data?.chapter_id as string) || null,
        phase: (n.data?.phase as string) || '',
        stage_name: (n.data?.stage_name as string) || '',
        icon: (n.data?.icon as string) || '',
        color: (n.data?.color as string) || '',
      })),
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
    } catch (e) {
      console.error('Failed to load progression from pack:', e)
    }
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
      const x = 200 + Math.random() * 400
      const y = nodes.length * 120
      const newNode: Node = {
        id,
        type,
        position: { x, y },
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

  const modRefs = (selectedNode?.data?.mod_refs as string[]) || []

  return (
    <div className="progression-panel">
      <ProgressionToolbar
        selectedNodeType={selectedNodeType}
        setSelectedNodeType={setSelectedNodeType}
        onAddNode={() => addNode(selectedNodeType)}
        onAutoGenerate={autoGenerate}
        onSave={saveGraph}
        onAnalyze={loadAnalysis}
      />
      <div className="progression-layout">
        <div className="progression-canvas">
          <ProgressionCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDeleteEdge={handleDeleteEdge}
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
      </div>
      {showAnalysis && analysis && (
        <ProgressionAnalysisOverlay analysis={analysis} onClose={() => setShowAnalysis(false)} />
      )}
    </div>
  )
}
