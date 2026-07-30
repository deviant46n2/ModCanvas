import type { SyncEvent, SyncSource } from './types';

const ECHO_COOLDOWN_MS = 5000;

class SyncLock {
  private locked = false;
  private lockedBy: SyncSource | null = null;
  private lockedAt = 0;

  get isLocked(): boolean {
    if (!this.locked) return false;
    if (Date.now() - this.lockedAt > ECHO_COOLDOWN_MS) {
      this.release();
      return false;
    }
    return true;
  }

  get owner(): SyncSource | null {
    return this.lockedBy;
  }

  acquire(source: SyncSource): boolean {
    if (this.isLocked && this.lockedBy !== source) return false;
    this.locked = true;
    this.lockedBy = source;
    this.lockedAt = Date.now();
    return true;
  }

  release(): void {
    this.locked = false;
    this.lockedBy = null;
    this.lockedAt = 0;
  }
}

export const globalSyncLock = new SyncLock();

export function isEchoEvent(event: SyncEvent): boolean {
  if (event.source !== 'WORKBENCH') return false;
  if (!globalSyncLock.isLocked) return false;
  if (globalSyncLock.owner === 'WORKBENCH') {
    const age = Date.now() - event.timestamp;
    return age < ECHO_COOLDOWN_MS;
  }
  return false;
}

export function shouldIgnoreIncoming(
  event: SyncEvent,
  lastWorkbenchSave: number,
): boolean {
  if (event.source === 'WORKBENCH') return true;
  if (event.timestamp <= lastWorkbenchSave) return true;
  return false;
}

export function formatSyncEvent(
  eventType: string,
  source: SyncSource,
  overrides?: Partial<SyncEvent>,
): SyncEvent {
  return {
    event: eventType as SyncEvent['event'],
    source,
    timestamp: Date.now(),
    ...overrides,
  };
}
