export type SyncSource = 'WORKBENCH' | 'MINECRAFT';

export type SyncStatus = 'IDLE' | 'DIRTY_WORKBENCH' | 'SYNCING' | 'RELOADING';

export type SyncEventType = 'RELOAD_QUESTS' | 'QUESTS_RELOADED_IN_GAME' | 'ASSETS_READY';

export interface SyncEvent {
  event: SyncEventType;
  source: SyncSource;
  mcVersion?: string;
  loader?: string;
  filePath?: string;
  timestamp: number;
}

export interface SyncState {
  status: SyncStatus;
  lastWorkbenchSave: number;
  lastIncomingReload: number;
  sourceOfLastChange: SyncSource | null;
}
