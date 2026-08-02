import { invoke } from '@tauri-apps/api/core'

/** Read the durable per-project history journal (JSON-lines text). */
export async function readHistoryJournal(projectId: string): Promise<string> {
  return invoke<string>('read_history_journal', { projectId })
}

/** Persist the durable per-project history journal (JSON-lines text). */
export async function writeHistoryJournal(projectId: string, content: string): Promise<void> {
  return invoke('write_history_journal', { projectId, content })
}
