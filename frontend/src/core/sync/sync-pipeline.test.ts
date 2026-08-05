import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncPipeline } from './sync-pipeline';
import { globalSyncLock } from './loop-guard';

describe('SyncPipeline — Workbench Save & Broadcast', () => {
  let pipeline: SyncPipeline;
  let mockWsSend: ReturnType<typeof vi.fn>;
  let stateChanges: unknown[] = [];

  beforeEach(() => {
    globalSyncLock.release();
    stateChanges = [];
    mockWsSend = vi.fn().mockResolvedValue(1);

    pipeline = new SyncPipeline({
      wsIpcSendEvent: mockWsSend as unknown as (eventType: string, path?: string, payload?: unknown) => Promise<number>,
      mcVersion: '1.21.1',
      loader: 'neoforge',
      // These tests exercise the (re-enabled) broadcast path explicitly.
      hotswapFrozen: false,
      onStateChange: (s) => { stateChanges.push(s); },
    });
  });

  it('should start in IDLE state', () => {
    expect(pipeline.state.status).toBe('IDLE');
    expect(pipeline.state.lastWorkbenchSave).toBe(0);
    expect(pipeline.state.sourceOfLastChange).toBeNull();
  });

  it('should NOT broadcast reload when hotswap is frozen (default)', async () => {
    vi.useFakeTimers();
    const frozen = new SyncPipeline({
      wsIpcSendEvent: mockWsSend as unknown as (eventType: string, path?: string, payload?: unknown) => Promise<number>,
      mcVersion: '1.21.1',
      loader: 'neoforge',
      onStateChange: () => {},
    });
    const saveFn = vi.fn().mockResolvedValue(undefined);

    frozen.scheduleSave(saveFn, 100);
    await vi.advanceTimersByTimeAsync(200);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(mockWsSend).not.toHaveBeenCalled();
    // The save still records a workbench write even without a broadcast.
    expect(frozen.state.lastWorkbenchSave).toBeGreaterThan(0);
    expect(frozen.state.status).toBe('IDLE');
    expect(frozen.state.sourceOfLastChange).toBe('WORKBENCH');

    vi.useRealTimers();
  });

  it('should mark DIRTY_WORKBENCH on markDirty()', () => {
    pipeline.markDirty();
    expect(pipeline.state.status).toBe('DIRTY_WORKBENCH');
  });

  it('should transition IDLE -> DIRTY_WORKBENCH on markDirty()', () => {
    expect(pipeline.state.status).toBe('IDLE');
    pipeline.markDirty();
    expect(pipeline.state.status).toBe('DIRTY_WORKBENCH');
  });

  it('should not re-enter DIRTY when already dirty', () => {
    pipeline.markDirty();
    pipeline.markDirty();
    const dirtyStates = stateChanges.filter(s => (s as any).status === 'DIRTY_WORKBENCH');
    expect(dirtyStates.length).toBe(1);
  });

  it('should save, broadcast, and reset status via scheduleSave', async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue(undefined);

    pipeline.scheduleSave(saveFn, 100);
    expect(pipeline.state.status).toBe('DIRTY_WORKBENCH');

    await vi.advanceTimersByTimeAsync(200);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(mockWsSend).toHaveBeenCalledTimes(1);

    const callArg = mockWsSend.mock.calls[0];
    expect(callArg[0]).toBe('RELOAD_QUESTS');
    const payload = callArg[2];
    expect(payload.mcVersion).toBe('1.21.1');
    expect(payload.loader).toBe('neoforge');
    expect(payload.source).toBe('WORKBENCH');
    expect(payload.command).toBe('/ftbquests reload');

    expect(pipeline.state.lastWorkbenchSave).toBeGreaterThan(0);
    expect(pipeline.state.status).toBe('IDLE');
    expect(pipeline.state.sourceOfLastChange).toBe('WORKBENCH');

    vi.useRealTimers();
  });

  it('should debounce multiple saves: only last one runs', async () => {
    vi.useFakeTimers();
    const saveFn1 = vi.fn().mockResolvedValue(undefined);
    const saveFn2 = vi.fn().mockResolvedValue(undefined);

    pipeline.scheduleSave(saveFn1, 100);
    pipeline.scheduleSave(saveFn2, 100);

    await vi.advanceTimersByTimeAsync(200);

    expect(saveFn1).not.toHaveBeenCalled();
    expect(saveFn2).toHaveBeenCalledTimes(1);
    expect(mockWsSend).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should handle WS send failure gracefully', async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue(undefined);
    mockWsSend.mockRejectedValue(new Error('IPC offline'));

    pipeline.scheduleSave(saveFn, 100);
    await vi.advanceTimersByTimeAsync(200);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(pipeline.state.status).toBe('IDLE');

    vi.useRealTimers();
  });

  it('should acquire sync lock on broadcast', async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue(undefined);

    expect(globalSyncLock.isLocked).toBe(false);
    pipeline.scheduleSave(saveFn, 100);
    await vi.advanceTimersByTimeAsync(200);

    expect(globalSyncLock.isLocked).toBe(true);
    expect(globalSyncLock.owner).toBe('WORKBENCH');

    vi.useRealTimers();
  });

  it('handleIncomingReload: should return true for MINECRAFT events after workbench save', async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue(undefined);
    pipeline.scheduleSave(saveFn, 50);
    await vi.advanceTimersByTimeAsync(200);

    const result = await pipeline.handleIncomingReload('MINECRAFT', Date.now() + 1000);
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('handleIncomingReload: should return false for WORKBENCH echo events', async () => {
    const result = await pipeline.handleIncomingReload('WORKBENCH', Date.now());
    expect(result).toBe(false);
  });

  it('handleIncomingReload: should return false for stale events', async () => {
    const result = await pipeline.handleIncomingReload('MINECRAFT', 0);
    expect(result).toBe(false);
  });

  it('destroy should clean up timers and queue', () => {
    const saveFn = vi.fn();
    pipeline.scheduleSave(saveFn, 100);
    pipeline.destroy();
    expect(pipeline.state.status).toBe('IDLE');
  });
});
