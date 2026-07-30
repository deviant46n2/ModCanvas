export interface ProgressionNodeData {
  id: string
  node_type: string
  label: string
  description: string
  position: { x: number; y: number }
  data: Record<string, string>
  mod_refs: string[]
  item_refs: string[]
  chapter_id: string | null
  phase: string
  stage_name: string
  icon: string
  color: string
}

export interface ProgressionEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
}

export interface ProgressionGraphData {
  id: string
  project_id: string
  name: string
  description: string
  nodes: ProgressionNodeData[]
  edges: ProgressionEdgeData[]
  mod_names: Record<string, string>
  chapters: Array<{ id: string; title: string; description: string; order_index: number }>
}

export interface ProgressionAnalysis {
  total_nodes: number
  total_edges: number
  phases: string[]
  bottlenecks: Array<{ node_id: string; node_label: string; incoming_count: number; severity: string }>
  dead_ends: string[]
  unreachable_nodes: string[]
  coverage: { mods_used: string[]; mods_unused: string[]; total_mods: number; coverage_percent: number }
  issues: Array<{ severity: string; message: string; node_id: string | null }>
}
