import type { Node, Edge } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { QuestGraphData, QuestObjectiveData, QuestRewardData, QuestSize } from './api'
// resolveIconKey available from nodes.tsx if needed

export function graphToApiData(
  graph: QuestGraphData,
  nodes: Node[],
  edges: Edge[],
): QuestGraphData {
  const SCALE = 48
  return {
    ...graph,
    nodes: nodes.map((n) => ({
      id: n.id,
      node_type: (n.data?.nodeType as string) || 'quest',
      label: (n.data?.label as string) || 'New Quest',
      description: (n.data?.description as string) || '',
      position: { x: n.position.x / SCALE, y: n.position.y / SCALE },
      data: {},
      objectives: (n.data?.objectives as QuestObjectiveData[]) || [],
      rewards: (n.data?.rewards as QuestRewardData[]) || [],
      required_items: (n.data?.required_items as string[]) || [],
      chapter_id: (n.data?.chapter_id as string) || null,
      icon: (n.data?.icon as string) || '',
      size: (n.data?.size as QuestSize) || { width: 24, height: 24 },
      color: (n.data?.color as string) || '',
      visibility: (n.data?.visibility as string) || 'Normal',
      optional: (n.data?.optional as boolean) || false,
      silently_complete: (n.data?.silently_complete as boolean) || false,
      can_be_repeatable: (n.data?.can_be_repeatable as boolean) || false,
      repeat_min_delay: (n.data?.repeat_min_delay as number) || 0,
      repeat_max_delay: (n.data?.repeat_max_delay as number) || 0,
      repeat_time: (n.data?.repeat_time as number) || 0,
      hide_quest_until_deps_complete: (n.data?.hide_quest_until_deps_complete as boolean) || false,
      hide_quest_until_quest_complete: (n.data?.hide_quest_until_quest_complete as boolean) || false,
      hide_quest_until_all_complete: (n.data?.hide_quest_until_all_complete as boolean) || false,
      disable_reward: (n.data?.disable_reward as boolean) || false,
      pause_reward: (n.data?.pause_reward as boolean) || false,
      lock_icon: (n.data?.lock_icon as string) || '',
      subtitle: (n.data?.subtitle as string) || '',
      quest_background: (n.data?.quest_background as string) || '',
      shape: (n.data?.shape as string) || 'Default',
      icon_scaling: (n.data?.icon_scaling as number) || 1.0,
      tags: (n.data?.tags as string[]) || [],
      progression_mode: (n.data?.progression_mode as string) || 'Default',
      sequential_tasks: (n.data?.sequential_tasks as boolean) || false,
      disable_completion_toast: (n.data?.disable_completion_toast as boolean) || false,
      ignore_reward_blocking: (n.data?.ignore_reward_blocking as boolean) || false,
      disable_jei_recipe: (n.data?.disable_jei_recipe as boolean) || false,
      min_window_width: (n.data?.min_window_width as number) || 0,
      hide_details_until_startable: (n.data?.hide_details_until_startable as boolean) || false,
      hide_text_until_completed: (n.data?.hide_text_until_completed as boolean) || false,
      invisible_until_completed: (n.data?.invisible_until_completed as boolean) || false,
      invisible_until_x_tasks: (n.data?.invisible_until_x_tasks as number) || 0,
      hide_dependency_lines: (n.data?.hide_dependency_lines as boolean) || false,
      hide_dependent_lines: (n.data?.hide_dependent_lines as boolean) || false,
      min_required_dependencies: (n.data?.min_required_dependencies as number) || 0,
      dependency_requirement: (n.data?.dependency_requirement as string) || 'AllCompleted',
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label as string | null,
      edge_type: 'prerequisite',
      inverted: false,
    })),
  }
}

export function toRfEdges(graph: QuestGraphData): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    type: 'smoothstep',
    animated: e.edge_type === 'optional',
    markerEnd: { type: MarkerType.ArrowClosed },
  }))
}
