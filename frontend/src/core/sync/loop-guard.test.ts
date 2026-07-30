import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { globalSyncLock, isEchoEvent, shouldIgnoreIncoming, formatSyncEvent } from './loop-guard';
import type { SyncEvent } from './types';

describe('SyncLock — Anti-Loop Guard', () => {
  beforeEach(() => {
    globalSyncLock.release();
  });

  afterEach(() => {
    globalSyncLock.release();
  });

  it('should start unlocked', () => {
    expect(globalSyncLock.isLocked).toBe(false);
    expect(globalSyncLock.owner).toBeNull();
  });

  it('should acquire lock for WORKBENCH source', () => {
    const acquired = globalSyncLock.acquire('WORKBENCH');
    expect(acquired).toBe(true);
    expect(globalSyncLock.isLocked).toBe(true);
    expect(globalSyncLock.owner).toBe('WORKBENCH');
  });

  it('should acquire lock for MINECRAFT source', () => {
    const acquired = globalSyncLock.acquire('MINECRAFT');
    expect(acquired).toBe(true);
    expect(globalSyncLock.isLocked).toBe(true);
    expect(globalSyncLock.owner).toBe('MINECRAFT');
  });

  it('should not acquire when already locked by different source', () => {
    globalSyncLock.acquire('WORKBENCH');
    const acquired = globalSyncLock.acquire('MINECRAFT');
    expect(acquired).toBe(false);
    expect(globalSyncLock.owner).toBe('WORKBENCH');
  });

  it('should allow re-acquire by same owner', () => {
    globalSyncLock.acquire('WORKBENCH');
    const acquired = globalSyncLock.acquire('WORKBENCH');
    expect(acquired).toBe(true);
  });

  it('should release lock', () => {
    globalSyncLock.acquire('WORKBENCH');
    expect(globalSyncLock.isLocked).toBe(true);
    globalSyncLock.release();
    expect(globalSyncLock.isLocked).toBe(false);
    expect(globalSyncLock.owner).toBeNull();
  });

  it('should auto-release after cooldown (simulate by mocking Date)', () => {
    vi.useFakeTimers();
    globalSyncLock.acquire('WORKBENCH');
    expect(globalSyncLock.isLocked).toBe(true);

    vi.advanceTimersByTime(6000);
    expect(globalSyncLock.isLocked).toBe(false);
    expect(globalSyncLock.owner).toBeNull();

    vi.useRealTimers();
  });
});

describe('isEchoEvent — Echo Detection', () => {
  beforeEach(() => {
    globalSyncLock.release();
  });

  afterEach(() => {
    globalSyncLock.release();
  });

  it('should return false when lock is not held', () => {
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'WORKBENCH',
      timestamp: Date.now(),
    };
    expect(isEchoEvent(event)).toBe(false);
  });

  it('should return true for recent WORKBENCH event when lock is held by WORKBENCH', () => {
    globalSyncLock.acquire('WORKBENCH');
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'WORKBENCH',
      timestamp: Date.now() - 100,
    };
    expect(isEchoEvent(event)).toBe(true);
  });

  it('should return false for MINECRAFT source events', () => {
    globalSyncLock.acquire('WORKBENCH');
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: Date.now(),
    };
    expect(isEchoEvent(event)).toBe(false);
  });

  it('should return false for stale events beyond cooldown', () => {
    globalSyncLock.acquire('WORKBENCH');
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'WORKBENCH',
      timestamp: Date.now() - 10000,
    };
    expect(isEchoEvent(event)).toBe(false);
  });
});

describe('shouldIgnoreIncoming — Stale Event Filter', () => {
  it('should ignore WORKBENCH-originated events', () => {
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'WORKBENCH',
      timestamp: Date.now(),
    };
    expect(shouldIgnoreIncoming(event, 0)).toBe(true);
  });

  it('should ignore events older than lastWorkbenchSave', () => {
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: 1000,
    };
    expect(shouldIgnoreIncoming(event, 2000)).toBe(true);
  });

  it('should NOT ignore MINECRAFT events newer than lastWorkbenchSave', () => {
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: 3000,
    };
    expect(shouldIgnoreIncoming(event, 1000)).toBe(false);
  });

  it('should NOT ignore MINECRAFT events when no workbench save occurred', () => {
    const event: SyncEvent = {
      event: 'QUESTS_RELOADED_IN_GAME',
      source: 'MINECRAFT',
      timestamp: Date.now(),
    };
    expect(shouldIgnoreIncoming(event, 0)).toBe(false);
  });
});

describe('formatSyncEvent — Event Builder', () => {
  it('should create a WORKBENCH event with defaults', () => {
    const event = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH');
    expect(event.event).toBe('RELOAD_QUESTS');
    expect(event.source).toBe('WORKBENCH');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('should include overrides', () => {
    const event = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH', {
      mcVersion: '1.21.1',
      loader: 'neoforge',
    });
    expect(event.mcVersion).toBe('1.21.1');
    expect(event.loader).toBe('neoforge');
  });
});
