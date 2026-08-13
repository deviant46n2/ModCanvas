export interface SyncEvent {
  event: string;
  source: 'WORKBENCH';
  timestamp: number;
}

export function formatSyncEvent(
  eventType: string,
  source: 'WORKBENCH',
  overrides?: Partial<SyncEvent>,
): SyncEvent {
  return {
    event: eventType,
    source,
    timestamp: Date.now(),
    ...overrides,
  };
}
