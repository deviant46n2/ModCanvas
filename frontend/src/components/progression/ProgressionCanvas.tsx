import { Handle, Position as RFPosition } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { ReactFlow, Controls, Background, MiniMap } from '@xyflow/react'
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ReactNode } from 'react'
import { FlagIcon, LockOpenIcon, ZapIcon, TrophyIcon, PackageIcon } from '../ui/icons'

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
        <div className="node-icon" style={{ color: borderColor }}>{icons[nodeType]}</div>
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

const nodeTypes = {
  milestone: ProgressionNodeComponent,
  unlock: ProgressionNodeComponent,
  phase: ProgressionNodeComponent,
  achievement: ProgressionNodeComponent,
  content: ProgressionNodeComponent,
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
}

export default function ProgressionCanvas({
  nodes, edges, onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onPaneClick, onDeleteEdge,
}: ProgressionCanvasProps) {
  return (
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
          onDeleteEdge(edge)
        }
      }}
    >
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          const nodeType = (node.data?.nodeType as string) || 'milestone'
          const colors: Record<string, string> = {
            phase: '#10b981', milestone: '#3b82f6', unlock: '#8b5cf6',
            achievement: '#f59e0b', content: '#ef4444',
          }
          return colors[nodeType] || '#6b7280'
        }}
        maskColor="rgba(0,0,0,0.7)"
      />
      <Background color="#374151" gap={15} />
    </ReactFlow>
  )
}
