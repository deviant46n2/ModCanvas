import { getAdapter } from '../../adapters';
import type { LoaderType } from '../../adapters/types';
import { globalSyncLock, formatSyncEvent } from './loop-guard';
import type { SyncSource, SyncState, SyncStatus } from './types';

type WsIpcSendEvent = (eventType: string, path?: string, payload?: unknown) => Promise<number>;

export interface PipelineConfig {
  wsIpcSendEvent: WsIpcSendEvent;
  mcVersion: string;
  loader: LoaderType;
  onStateChange?: (state: SyncState) => void;
}

export class SyncPipeline {
  private config: PipelineConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueue: Array<() => Promise<void>> = [];
  private _state: SyncState = {
    status: 'IDLE',
    lastWorkbenchSave: 0,
    lastIncomingReload: 0,
    sourceOfLastChange: null,
  };

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  get state(): SyncState {
    return { ...this._state };
  }

  private setStatus(status: SyncStatus): void {
    this._state.status = status;
    this.config.onStateChange?.(this.state);
  }

  private setSource(source: SyncSource): void {
    this._state.sourceOfLastChange = source;
  }

  markDirty(): void {
    if (this._state.status === 'IDLE') {
      this.setStatus('DIRTY_WORKBENCH');
    }
  }

  scheduleSave(saveFn: () => Promise<void>, delayMs = 300): void {
    this.markDirty();
    this.saveQueue.push(saveFn);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), delayMs);
  }

  private async flush(): Promise<void> {
    this.debounceTimer = null;
    if (this.saveQueue.length === 0) return;

    this.setStatus('SYNCING');

    const fn = this.saveQueue[this.saveQueue.length - 1];
    this.saveQueue = [];

    try {
      await fn();
      await this.broadcastReload();
      this._state.lastWorkbenchSave = Date.now();
      this.setSource('WORKBENCH');
    } catch (err) {
      console.error('[SyncPipeline] save failed:', err);
    } finally {
      this.setStatus('IDLE');
    }
  }

  private async broadcastReload(): Promise<void> {
    globalSyncLock.acquire('WORKBENCH');

    const adapter = getAdapter(this.config.mcVersion, this.config.loader);
    const cmd = adapter.getQuestReloadCommand();

    const event = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH', {
      mcVersion: this.config.mcVersion,
      loader: this.config.loader,
    });

    try {
      await this.config.wsIpcSendEvent(
        event.event,
        undefined,
        {
          ...event,
          command: cmd,
        },
      );
    } catch (err) {
      console.warn('[SyncPipeline] broadcast failed (IPC offline?):', err);
    }
  }

  async handleIncomingReload(
    source: SyncSource,
    timestamp: number,
  ): Promise<boolean> {
    this._state.lastIncomingReload = timestamp;
    this.setSource(source);
    this.setStatus('RELOADING');

    if (source === 'WORKBENCH') {
      console.log('[SyncPipeline] ignoring self-originated reload');
      this.setStatus('IDLE');
      return false;
    }

    if (timestamp <= this._state.lastWorkbenchSave) {
      console.log('[SyncPipeline] ignoring stale reload event');
      this.setStatus('IDLE');
      return false;
    }

    this.setStatus('IDLE');
    return true;
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.saveQueue = [];
    this.setStatus('IDLE');
  }
}
