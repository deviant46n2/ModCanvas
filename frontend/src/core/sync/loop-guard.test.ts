import { describe, it, expect } from 'vitest';
import { formatSyncEvent } from './loop-guard';
import type { SyncEvent } from './loop-guard';

describe('formatSyncEvent — reload event shape', () => {
  it('builds a WORKBENCH event with a timestamp', () => {
    const before = Date.now();
    const ev = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH');
    const after = Date.now();
    expect(ev.event).toBe('RELOAD_QUESTS');
    expect(ev.source).toBe('WORKBENCH');
    expect(ev.timestamp).toBeGreaterThanOrEqual(before);
    expect(ev.timestamp).toBeLessThanOrEqual(after);
  });

  it('applies overrides', () => {
    const ev = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH', { timestamp: 123 } as Partial<SyncEvent>);
    expect(ev.timestamp).toBe(123);
  });
});
