import { useRef, useCallback, useEffect } from 'react';
import { SyncPipeline } from '../../core/sync';
import { FileWatcher } from '../../core/sync';
import { globalAssetCache } from '../../core/theme';
import type { SyncState } from '../../core/sync/types';

export interface QuestSyncConfig {
  mcVersion: string;
  loader: 'neoforge' | 'forge' | 'fabric' | 'quilt';
  wsIpcSendEvent: (eventType: string, path?: string, payload?: unknown) => Promise<number>;
  onReloadFromGame: () => Promise<void>;
  onStateChange?: (state: SyncState) => void;
}

export interface QuestSyncHandle {
  scheduleSave: (saveFn: () => Promise<void>, delayMs?: number) => void;
  handleIncomingEvent: (raw: unknown) => Promise<void>;
  pipelineState: SyncState;
}

export function useQuestSync(config: QuestSyncConfig): QuestSyncHandle {
  const configRef = useRef(config);
  configRef.current = config;

  const pipelineRef = useRef<SyncPipeline | null>(null);
  const watcherRef = useRef<FileWatcher | null>(null);

  const pipelineStateRef = useRef<SyncState>({
    status: 'IDLE',
    lastWorkbenchSave: 0,
    lastIncomingReload: 0,
    sourceOfLastChange: null,
  });

  useEffect(() => {
    const watcher = new FileWatcher({
      onReloadFromGame: async () => {
        await configRef.current.onReloadFromGame();
      },
      onAssetsReady: async (payload) => {
        await globalAssetCache.processAssetsReady(payload);
      },
    });

    const pipeline = new SyncPipeline({
      wsIpcSendEvent: async (eventType, path, payload) => {
        return configRef.current.wsIpcSendEvent(eventType, path, payload);
      },
      mcVersion: config.mcVersion,
      loader: config.loader,
      onStateChange: (state) => {
        pipelineStateRef.current = state;
        watcher.updateLastWorkbenchSave(state.lastWorkbenchSave);
        configRef.current.onStateChange?.(state);
      },
    });

    pipelineRef.current = pipeline;
    watcherRef.current = watcher;

    return () => {
      pipeline.destroy();
    };
  }, [config.mcVersion, config.loader]);

  const scheduleSave = useCallback((saveFn: () => Promise<void>, delayMs = 300) => {
    pipelineRef.current?.scheduleSave(saveFn, delayMs);
  }, []);

  const handleIncomingEvent = useCallback(async (raw: unknown) => {
    await watcherRef.current?.handleIncomingEvent(raw);
  }, []);

  return {
    scheduleSave,
    handleIncomingEvent,
    get pipelineState() { return { ...pipelineStateRef.current }; },
  };
}
