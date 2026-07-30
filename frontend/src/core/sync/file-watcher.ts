import { globalSyncLock, shouldIgnoreIncoming } from './loop-guard';
import type { SyncEvent, SyncSource } from './types';

export type OnReloadFromGame = () => Promise<void>;
export type OnAssetsReady = (payload: unknown) => Promise<void>;

export interface FileWatcherConfig {
  onReloadFromGame: OnReloadFromGame;
  onAssetsReady?: OnAssetsReady;
}

export class FileWatcher {
  private config: FileWatcherConfig;
  private lastWorkbenchSave = 0;

  constructor(config: FileWatcherConfig) {
    this.config = config;
  }

  updateLastWorkbenchSave(timestamp: number): void {
    this.lastWorkbenchSave = timestamp;
  }

  async handleIncomingEvent(raw: unknown): Promise<void> {
    const event = this.parseIncoming(raw);
    if (!event) return;

    switch (event.event) {
      case 'QUESTS_RELOADED_IN_GAME': {
        await this.handleReloadEvent(event);
        break;
      }
      case 'ASSETS_READY': {
        await this.handleAssetsReady(event);
        break;
      }
      default: {
        console.log('[FileWatcher] unhandled event:', event.event);
      }
    }
  }

  private parseIncoming(raw: unknown): SyncEvent | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.event !== 'string') return null;

    const source = (obj.source as SyncSource) || 'MINECRAFT';
    const timestamp = (obj.timestamp as number) || Date.now();

    return {
      event: obj.event as SyncEvent['event'],
      source,
      timestamp,
      mcVersion: obj.mcVersion as string | undefined,
      loader: obj.loader as string | undefined,
      filePath: obj.filePath as string | undefined,
    };
  }

  private async handleReloadEvent(event: SyncEvent): Promise<void> {
    if (shouldIgnoreIncoming(event, this.lastWorkbenchSave)) {
      console.log('[FileWatcher] ignoring suppressed reload:', event.source);
      return;
    }

    if (event.source === 'WORKBENCH') {
      if (globalSyncLock.isLocked && globalSyncLock.owner === 'WORKBENCH') {
        console.log('[FileWatcher] echo suppressed via lock');
        return;
      }
    }

    console.log('[FileWatcher] in-game reload detected, re-parsing canvas');
    await this.config.onReloadFromGame();
  }

  private async handleAssetsReady(event: SyncEvent): Promise<void> {
    console.log('[FileWatcher] assets ready from game');
    if (this.config.onAssetsReady) {
      await this.config.onAssetsReady(event);
    }
  }
}
