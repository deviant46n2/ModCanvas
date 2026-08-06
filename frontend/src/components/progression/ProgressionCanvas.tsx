import { useEffect, useMemo } from 'react'
import { Handle, Position as RFPosition } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { ReactFlow, Controls, Background, MiniMap, MarkerType, useReactFlow } from '@xyflow/react'
import type { Node, Edge, NodeChange, EdgeChange, ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CSSProperties, ReactNode } from 'react'
import { FlagIcon, LockOpenIcon, ZapIcon, TrophyIcon, PackageIcon } from '../ui/icons'
import { nodeTypeColor, hexToRgba } from '../../core/progression/phase-bands'

function ProgressionNodeComponent({ data, selected }: NodeProps<Node>) {
  const nodeType = (data.nodeType as string) || 'milestone'
  const icons: Record<string, ReactNode> = {
    milestone: <FlagIcon size={18} />, unlock: <LockOpenIcon size={18} />, phase: <ZapIcon size={18} />,
    achievement: <TrophyIcon size={18} />, content: <PackageIcon size={18} />,
  }
  const modCount = ((data.mod_refs as string[]) || []).length
  const label = (data.label as string) || 'Node'
  const desc = (data.description as string) || ''
  const phase = (data.phase as string) || ''
  const accent = (data.color as string) || nodeTypeColor(nodeType)

  return (
    <div
      className={`progression-node ${nodeType}-node ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': accent } as CSSProperties}
    >
      <div className="node-header">
        <div className="node-icon" style={{ color: accent, background: hexToRgba(accent, 0.14) }}>
          {icons[nodeType]}
        </div>
        <div className="node-title">
          <div className="node-label">{label}</div>
          {phase && <span className="node-phase">{phase}</span>}
        </div>
      </div>
      {desc && <div className="node-desc">{desc.length > 80 ? desc.slice(0, 80) + '...' : desc}</div>}
      {modCount > 0 && <span className="node-mod-count">{modCount} mod{modCount !== 1 ? 's' : ''}</span>}
      <Handle type="target" position={RFPosition.Top} />
      <Handle type="source" position={RFPosition.Bottom} />
    </div>
  )
}

/** Tinted lane behind a phase's nodes. Derived data only — rendered from
 *  `computePhaseBands`, never persisted, never selectable/draggable. */
function PhaseBandNode({ data }: NodeProps<Node>) {
  const phase = (data.phase as string) || ''
  const color = (data.color as string) || '#3b82f6'
  const count = (data.count as number) || 0
  return (
    <div
      className="phase-band"
      style={{
        width: data.width as number,
        height: data.height as number,
        background: hexToRgba(color, 0.06),
        border: `1px solid ${hexToRgba(color, 0.25)}`,
      }}
    >
      <div className="phase-band-header" style={{ color }}>
        {phase}
        {count > 0 && <span className="phase-band-count">{count}</span>}
      </div>
    </div>
  )
}

const nodeTypes = {
  milestone: ProgressionNodeComponent,
  unlock: ProgressionNodeComponent,
  phase: ProgressionNodeComponent,
  achievement: ProgressionNodeComponent,
  content: ProgressionNodeComponent,
  phaseBand: PhaseBandNode,
}

interface ProgressionCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: any) => void
  onNodeClick: (event: React.MouseEvent, node: Node) => void
  onPaneClick: () => void
  onDeleteEdge: (edge: Edge) => void
  /** Bump to fit the whole graph into view (e.g. after loading a template).
   *  React Flow's `fitView` prop only runs on mount, so later loads need this. */
  fitViewKey?: number
  /** Hands the ReactFlow instance up so the parent can add nodes at the
   *  viewport center instead of random coordinates. */
  onFlowReady?: (api: ReactFlowInstance) => void
}

export default function ProgressionCanvas({
  nodes, edges, onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onPaneClick, onDeleteEdge, fitViewKey, onFlowReady,
}: ProgressionCanvasProps) {
  const flowApi = useReactFlow()

  useEffect(() => {
    onFlowReady?.(flowApi)
  }, [flowApi, onFlowReady])

  // Fit after graph loads that happen post-mount (template / auto-generate).
  useEffect(() => {
    if (fitViewKey === undefined) return
    const t = setTimeout(() => flowApi.fitView({ padding: 0.12, duration: 300 }), 50)
    return () => clearTimeout(t)
  }, [fitViewKey, flowApi])
  // Tint each edge by its source node's type color so the flow reads at a
  // glance. The stroke comes from a CSS var so the selected state can override
  // it; the arrowhead gets the explicit color since markers are SVG defs.
  const coloredEdges = useMemo(
    () =>
      edges.map((e) => {
        const source = nodes.find((n) => n.id === e.source)
        const color = nodeTypeColor(source?.data?.nodeType as string)
        return {
          ...e,
          style: { '--edge-color': color } as CSSProperties,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        }
      }),
    [edges, nodes]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={coloredEdges}
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
          onDeleteEdge(edge)
        }
      }}
    >
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          const nodeType = (node.data?.nodeType as string) || 'milestone'
          return nodeTypeColor(nodeType)
        }}
        maskColor="rgba(0,0,0,0.7)"
      />
      <Background color="#2b2b30" gap={18} size={1} />
    </ReactFlow>
  )
}
