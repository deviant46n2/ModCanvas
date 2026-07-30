import { useCallback, useState, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react'
import type { Connection, Node, Edge, NodeTypes, NodeProps } from '@xyflow/react'
import { Handle, Position as RFPosition } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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

function ProgressionNodeComponent({ data, selected }: NodeProps<Node>) {
  const nodeType = (data.nodeType as string) || 'milestone'
  const icons: Record<string, string> = {
    milestone: '🎯', unlock: '🔓', phase: '⚡', achievement: '🏆', content: '📦',
  }
  const modCount = ((data.mod_refs as string[]) || []).length
  const label = (data.label as string) || 'Node'
  const desc = (data.description as string) || ''
  const phase = (data.phase as string) || ''
  const nodeColor = (data.color as string) || ''

  const borderColor = nodeColor || (
    nodeType === 'phase' ? '#10b981' :
    nodeType === 'milestone' ? '#3b82f6' :
    nodeType === 'unlock' ? '#8b5cf6' :
    nodeType === 'achievement' ? '#f59e0b' :
    nodeType === 'content' ? '#ef4444' : '#6b7280'
  )

  return (
    <div className={`progression-node ${nodeType}-node ${selected ? 'selected' : ''}`} style={{ borderColor }}>
      <div className="node-header">
        <div className="node-icon">{icons[nodeType] || '📦'}</div>
        <div className="node-title">
          <div className="node-label">{label}</div>
          {phase && <div className="node-subtitle">{phase}</div>}
        </div>
      </div>
      {desc && <div className="node-desc">{desc.length > 80 ? desc.slice(0, 80) + '...' : desc}</div>}
      {modCount > 0 && <div className="node-mod-count">{modCount} mod{modCount !== 1 ? 's' : ''}</div>}
      <Handle type="target" position={RFPosition.Top} />
      <Handle type="source" position={RFPosition.Bottom} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  milestone: ProgressionNodeComponent,
  unlock: ProgressionNodeComponent,
  phase: ProgressionNodeComponent,
  achievement: ProgressionNodeComponent,
  content: ProgressionNodeComponent,
}

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
      <div className="progression-toolbar">
        <div className="toolbar-section">
          <h3>Progression Graph</h3>
        </div>
        <div className="toolbar-actions">
          <div className="node-type-selector">
            <label>Type:</label>
            <select value={selectedNodeType} onChange={(e) => setSelectedNodeType(e.target.value)}>
              <option value="milestone">Milestone</option>
              <option value="unlock">Unlock</option>
              <option value="phase">Phase</option>
              <option value="achievement">Achievement</option>
              <option value="content">Content</option>
            </select>
          </div>
          <button className="btn-primary" onClick={() => addNode(selectedNodeType)}>+ Add</button>
          <button className="btn-success" onClick={autoGenerate}>Load from Pack</button>
          <button className="btn-secondary" onClick={saveGraph}>Save</button>
          <button className="btn-secondary" onClick={loadAnalysis}>Analyze</button>
        </div>
      </div>

      <div className="progression-layout">
        <div className="progression-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            onEdgeDoubleClick={(_, edge) => {
              if (confirm('Delete this connection?')) {
                setEdges((eds) => eds.filter((e) => e.id !== edge.id))
                setTimeout(saveGraph, 100)
              }
            }}
          >
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const type = (node.data?.nodeType as string) || 'milestone'
                const colors: Record<string, string> = {
                  phase: '#10b981', milestone: '#3b82f6', unlock: '#8b5cf6',
                  achievement: '#f59e0b', content: '#ef4444',
                }
                return colors[type] || '#6b7280'
              }}
              maskColor="rgba(0,0,0,0.7)"
            />
            <Background color="#374151" gap={15} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="progression-inspector">
            <div className="inspector-header">
              <h4>Edit Node</h4>
              <button className="btn-close" onClick={() => setSelectedNode(null)}>×</button>
            </div>
            <div className="inspector-body">
              <div className="inspector-field">
                <label>Label</label>
                <input type="text" value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && updateSelectedNode()}
                />
              </div>
              <div className="inspector-field">
                <label>Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
              </div>
              <div className="inspector-row">
                <div className="inspector-field half">
                  <label>Phase</label>
                  <input type="text" value={editPhase} onChange={(e) => setEditPhase(e.target.value)} placeholder="Early Game" />
                </div>
                <div className="inspector-field half">
                  <label>Stage Name</label>
                  <input type="text" value={editStageName} onChange={(e) => setEditStageName(e.target.value)} />
                </div>
              </div>
              <div className="inspector-row">
                <div className="inspector-field half">
                  <label>Color (hex)</label>
                  <input type="color" value={editColor || '#3b82f6'} onChange={(e) => setEditColor(e.target.value)} />
                </div>
                <div className="inspector-field half">
                  <label>Icon (item id)</label>
                  <input type="text" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} placeholder="minecraft:nether_star" />
                </div>
              </div>

              {modRefs.length > 0 && (
                <div className="inspector-field">
                  <label>Linked Mods</label>
                  <div className="inspector-mods">
                    {modRefs.map((modId, i) => {
                      const displayName = graph?.mod_names?.[modId] || modId
                      return <span key={i} className="mod-tag" title={modId}>{displayName}</span>
                    })}
                  </div>
                </div>
              )}

              <div className="inspector-actions">
                <button className="btn-primary" onClick={updateSelectedNode}>Apply</button>
                <button className="btn-danger" onClick={deleteSelectedNode}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAnalysis && analysis && (
        <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="modal analysis-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Progression Analysis</h2>
            <div className="analysis-grid">
              <div className="analysis-stat">
                <div className="stat-value">{analysis.total_nodes}</div>
                <div className="stat-label">Nodes</div>
              </div>
              <div className="analysis-stat">
                <div className="stat-value">{analysis.total_edges}</div>
                <div className="stat-label">Connections</div>
              </div>
              <div className="analysis-stat">
                <div className="stat-value">{analysis.phases.length}</div>
                <div className="stat-label">Phases</div>
              </div>
              <div className="analysis-stat">
                <div className="stat-value">{analysis.coverage.total_mods}</div>
                <div className="stat-label">Mods Referenced</div>
              </div>
            </div>
            {analysis.issues.length > 0 && (
              <div className="analysis-issues">
                <h3>Issues</h3>
                {analysis.issues.map((issue, i) => (
                  <div key={i} className={`issue-${issue.severity}`}>{issue.message}</div>
                ))}
              </div>
            )}
            {analysis.bottlenecks.length > 0 && (
              <div className="analysis-section">
                <h3>Bottlenecks</h3>
                {analysis.bottlenecks.map((b) => (
                  <div key={b.node_id} className="bottleneck-item">
                    <strong>{b.node_label}</strong> — {b.incoming_count} prerequisites
                    <span className={`severity-${b.severity}`}>{b.severity}</span>
                  </div>
                ))}
              </div>
            )}
            {analysis.dead_ends.length > 0 && (
              <div className="analysis-section">
                <h3>Dead Ends</h3>
                <p>{analysis.dead_ends.length} node(s) with no connections</p>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAnalysis(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
