import { invoke } from '@tauri-apps/api/core'
import type { ProgressionGraphData, ProgressionAnalysis } from './progression-types'

export async function getProgressionGraph(projectId: string): Promise<ProgressionGraphData> {
  return invoke<ProgressionGraphData>('get_progression_graph', { projectId })
}

export async function saveProgressionGraph(
  projectId: string,
  graph: ProgressionGraphData,
): Promise<void> {
  return invoke('save_progression_graph', { projectId, graph })
}

export async function analyzeProgression(projectId: string): Promise<ProgressionAnalysis> {
  return invoke<ProgressionAnalysis>('analyze_progression', { projectId })
}

export async function autoGenerateProgression(projectId: string): Promise<ProgressionGraphData> {
  return invoke<ProgressionGraphData>('auto_generate_progression', { projectId })
}
