// Analysis / import-report types for quest packs. Split out of `quest-types.ts`;
// imports the top-level graph type from `./graph`.

import type { QuestGraphData } from './graph'

export interface PrismInstance {
  name: string
  path: string
}

export interface ImportIssue {
  severity: string
  category: string
  message: string
  file: string | null
  node_id: string | null
}

export interface ImportStats {
  quests_parsed: number
  chapters_parsed: number
  chapter_groups_parsed: number
  tasks_parsed: number
  rewards_parsed: number
  dependencies_resolved: number
  dependencies_missing: number
  unknown_task_types: string[]
  unknown_reward_types: string[]
  files_processed: number
  files_failed: number
  title_from_task: number
  icon_from_task: number
  chapter_images_total: number
}

export interface FtbQuestsImportResult {
  graph: QuestGraphData
  format: string
  layout: string
  quest_count: number
  chapter_count: number
  stats: ImportStats
  issues?: ImportIssue[]
}
