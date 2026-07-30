import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileWatcher, type OnReloadFromGame, type OnAssetsReady } from './file-watcher';
import { globalSyncLock } from './loop-guard';

describe('FileWatcher — Incoming Event Handling', () => {
  let watcher: FileWatcher;
  let onReloadFromGame: ReturnType<typeof vi.fn>;
  let onAssetsReady: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalSyncLock.release();
    onReloadFromGame = vi.fn().mockResolvedValue(undefined);
    onAssetsReady = vi.fn().mockResolvedValue(undefined);

    watcher = new FileWatcher({
      onReloadFromGame: onReloadFromGame as unknown as OnReloadFromGame,
      onAssetsReady: onAssetsReady as unknown as OnAssetsReady,
    });
  });

  it('should call onReloadFromGame for QUESTS_RELOADED_IN_GAME from MINECRAFT', async () => {
    await watcher.handleIncomingEvent({
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: Date.now(),
    });

    expect(onReloadFromGame).toHaveBeenCalledTimes(1);
  });

  it('should call onAssetsReady for ASSETS_READY event', async () => {
    await watcher.handleIncomingEvent({
      event: 'ASSETS_READY',
      source: 'MINECRAFT',
      timestamp: Date.now(),
      payload: { cachePath: '.workbench/cache' },
    });

    expect(onAssetsReady).toHaveBeenCalledTimes(1);
  });

  it('should suppress WORKBENCH-echo events via lock', async () => {
    globalSyncLock.acquire('WORKBENCH');

    await watcher.handleIncomingEvent({
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'WORKBENCH',
      timestamp: Date.now(),
    });

    expect(onReloadFromGame).not.toHaveBeenCalled();
  });

  it('should suppress stale events older than lastWorkbenchSave', async () => {
    watcher.updateLastWorkbenchSave(5000);

    await watcher.handleIncomingEvent({
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: 1000,
    });

    expect(onReloadFromGame).not.toHaveBeenCalled();
  });

  it('should ignore malformed events silently', async () => {
    await watcher.handleIncomingEvent(null);
    await watcher.handleIncomingEvent('string');
    await watcher.handleIncomingEvent({});
    expect(onReloadFromGame).not.toHaveBeenCalled();
    expect(onAssetsReady).not.toHaveBeenCalled();
  });

  it('should handle MINECRAFT events with no timestamp (use current time)', async () => {
    await watcher.handleIncomingEvent({
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
    });

    expect(onReloadFromGame).toHaveBeenCalledTimes(1);
  });

  it('should pass MINECRAFT events that are newer than lastWorkbenchSave', async () => {
    watcher.updateLastWorkbenchSave(100);
    const now = Date.now();

    await watcher.handleIncomingEvent({
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: now,
    });

    expect(onReloadFromGame).toHaveBeenCalledTimes(1);
  });

  it('should log but not crash on unknown events', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await watcher.handleIncomingEvent({ event: 'UNKNOWN_EVENT', source: 'MINECRAFT' });
    expect(consoleSpy).toHaveBeenCalledWith('[FileWatcher] unhandled event:', 'UNKNOWN_EVENT');
    consoleSpy.mockRestore();
  });
});
