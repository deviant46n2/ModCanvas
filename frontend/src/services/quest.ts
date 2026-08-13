import { invoke } from '@tauri-apps/api/core'
import type { QuestGraphData, FtbQuestsImportResult, PrismInstance } from './quest-types'

export async function getQuestGraph(projectId: string): Promise<QuestGraphData> {
  return invoke<QuestGraphData>('get_quest_graph', { projectId })
}

export async function saveQuestGraph(projectId: string, graph: QuestGraphData): Promise<void> {
  return invoke('save_quest_graph', { projectId, graph })
}

export async function importFtbQuestsFromDir(packDir: string): Promise<FtbQuestsImportResult> {
  return invoke<FtbQuestsImportResult>('import_ftb_quests_from_dir', { packDir })
}

export async function exportFtbQuestsToDir(projectId: string, outputDir: string): Promise<void> {
  return invoke('export_ftb_quests_to_dir', { projectId, outputDir })
}

export async function listPrismInstances(): Promise<PrismInstance[]> {
  return invoke<PrismInstance[]>('list_prism_instances')
}
