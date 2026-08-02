import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from './store';
import {
  encodeJournal,
  parseJournal,
  parseContent,
} from './journal';

describe('HistoryStore ordering', () => {
  let store: HistoryStore;
  beforeEach(() => {
    store = new HistoryStore({ coalesceWindowMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function commitConfig(content: string, opts?: { split?: boolean }) {
    return store.commit(
      { subject: 'config', target: 'tome', label: 'edit tome.toml', before: 'old', after: content },
      opts
    );
  }

  it('reverses edits in chronological order across different tools', () => {
    // Simulate "move a quest, switch, then edit a config".
    commitConfig('v2', { split: true });
    store.commit(
      { subject: 'graph', target: 'q1', label: 'move quest', before: { x: 0 }, after: { x: 10 } },
      { split: true }
    );

    expect(store.undoDepth).toBe(2);
    const first = store.undo();
    expect(first?.subject).toBe('graph'); // most recent is the quest move
    expect(first?.after).toEqual({ x: 10 });

    const second = store.undo();
    expect(second?.subject).toBe('config');
    expect(second?.after).toBe('v2');

    // Redo replays in the original order: config then quest.
    const r1 = store.redo();
    expect(r1?.subject).toBe('config');
    const r2 = store.redo();
    expect(r2?.subject).toBe('graph');
    expect(r2?.after).toEqual({ x: 10 });
  });

  it('coalesces rapid edits of the same resource into one gesture', () => {
    commitConfig('v1');
    commitConfig('v2');
    commitConfig('v3');

    expect(store.undoDepth).toBe(1);
    const undoEntry = store.undo();
    expect(undoEntry?.before).toBe('old');
    expect(undoEntry?.after).toBe('v3');
    expect(store.canUndo).toBe(false);
  });

  it('split forces a fresh undo step even for the same target', () => {
    commitConfig('v1', { split: true });
    commitConfig('v2', { split: true });
    expect(store.undoDepth).toBe(2);
  });

  it('coalescing respects a break in the time window', () => {
    vi.useFakeTimers();
    commitConfig('v1');
    vi.advanceTimersByTime(2000); // exceeds the 1000 ms window
    commitConfig('v2');
    expect(store.undoDepth).toBe(2);
  });

  it('coalescing never merges across different targets or subjects', () => {
    commitConfig('a');
    store.commit(
      { subject: 'config', target: 'other.toml', label: 'b', before: 'old', after: 'b' },
      { split: true }
    );
    store.commit(
      { subject: 'graph', target: 'q1', label: 'c', before: 0, after: 1 },
      { split: true }
    );
    expect(store.undoDepth).toBe(3);
  });

  it('committing new edits after an undo drops the redo branch', () => {
    commitConfig('v1', { split: true });
    commitConfig('v2', { split: true });
    store.undo();
    expect(store.canRedo).toBe(true);
    commitConfig('v3', { split: true });
    expect(store.canRedo).toBe(false);
    expect(store.undoDepth).toBe(2);
    const u = store.undo();
    expect(u?.after).toBe('v3');
  });

  it('undo returns a copy-safe before state and does not mutate the log', () => {
    commitConfig('v1', { split: true });
    const entry = store.undo();
    expect(entry?.before).toBe('old');
    // Repeated undo once exhausted.
    expect(store.undo()).toBeUndefined();
  });

  it('trims oldest entries beyond the memory cap while preserving presence', () => {
    const bounded = new HistoryStore({ maxEntries: 3 });
    let i = 0;
    // Oldest two entries dropped.
    bounded.commit({ subject: 'config', target: 'f', label: `e${i++}`, before: `b${i}`, after: `a${i}` }, { split: true });
    bounded.commit({ subject: 'config', target: 'f', label: `e${i++}`, before: 'b', after: 'a' }, { split: true });
    bounded.commit({ subject: 'config', target: 'f', label: `e${i++}`, before: 'b', after: 'a' }, { split: true });
    bounded.commit({ subject: 'config', target: 'f', label: `e${i++}`, before: 'b', after: 'a' }, { split: true });
    const snap = bounded.snapshot();
    expect(snap.items.length).toBe(3);
    expect(snap.present).toBe(3);
  });
});

describe('HistoryStore journal export', () => {
  it('flattens object payloads and flags presence', () => {
    const store = new HistoryStore();
    store.commit(
      { subject: 'graph', target: 'q1', label: 'drag', before: { x: 0 }, after: { x: 5 } },
      { split: true }
    );
    const records = store.exportJournal();
    expect(records).toHaveLength(1);
    expect(records[0].subject).toBe('graph');
    expect(JSON.parse(records[0].after)).toEqual({ x: 5 });
    expect(records[1]).toBeUndefined();
  });

  it('loadJournal restores entries, presence, and id counters', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a.toml', label: 'e1', before: 'v1', after: 'v2' }, { split: true });
    store.commit({ subject: 'config', target: 'a.toml', label: 'e2', before: 'v2', after: 'v3' }, { split: true });
    store.commit({ subject: 'graph', target: 'q1', label: 'move', before: { x: 0 }, after: { x: 1 } }, { split: true });
    store.undo(); // move is now pending redo; two config edits remain present

    const records = store.exportJournal();
    const fresh = new HistoryStore();
    fresh.loadJournal(records);

    expect(fresh.undoDepth).toBe(2);
    const u1 = fresh.undo();
    expect(u1?.subject).toBe('config');
    expect(u1?.before).toBe('v2');
    expect(fresh.canRedo).toBe(true);
    const r = fresh.redo();
    expect(r?.subject).toBe('config');
    // Object payloads come back as objects via rehydrate.
    const all = fresh.exportJournal();
    expect(JSON.parse(all[2].after)).toEqual({ x: 1 });
  });

  it('loadJournal resets prior in-memory state', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a', label: 'old', before: 'x', after: 'y' }, { split: true });
    store.loadJournal([]);
    expect(store.undoDepth).toBe(0);
    expect(store.canUndo).toBe(false);
  });

  it('peekUndo reflects the top undoable entry', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a', label: 'e', before: 'x', after: 'y' }, { split: true });
    expect(store.peekUndo()?.subject).toBe('config');
    store.undo();
    expect(store.peekUndo()).toBeUndefined();
  });

  it('jumpTo travels backward applying before-states in order', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a', label: 'e1', before: 'v1', after: 'v2' }, { split: true });
    store.commit({ subject: 'config', target: 'a', label: 'e2', before: 'v2', after: 'v3' }, { split: true });
    store.commit({ subject: 'graph', target: 'q1', label: 'g', before: { x: 0 }, after: { x: 1 } }, { split: true });

    const back = store.jumpTo(1);
    expect(back.undoSteps.map((e) => e.after)).toEqual([{ x: 1 }, 'v3']);
    expect(back.redoSteps).toHaveLength(0);
    expect(store.undoDepth).toBe(1);
  });

  it('jumpTo travels forward applying after-states in order', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a', label: 'e1', before: 'v1', after: 'v2' }, { split: true });
    store.commit({ subject: 'config', target: 'a', label: 'e2', before: 'v2', after: 'v3' }, { split: true });
    store.jumpTo(1);

    const fwd = store.jumpTo(3);
    expect(fwd.redoSteps.map((e) => e.after)).toEqual(['v3']);
    expect(fwd.undoSteps).toHaveLength(0);
    expect(store.undoDepth).toBe(2);
  });

  it('jumpTo clamps out-of-range targets and no-ops when equal', () => {
    const store = new HistoryStore();
    store.commit({ subject: 'config', target: 'a', label: 'e1', before: 'v1', after: 'v2' }, { split: true });
    const { undoSteps, redoSteps } = store.jumpTo(2);
    expect(undoSteps).toHaveLength(0);
    expect(redoSteps).toHaveLength(0);
    const back = store.jumpTo(-5);
    expect(back.undoSteps).toHaveLength(1);
    expect(store.undoDepth).toBe(0);
  });
});

describe('journal codec', () => {
  it('round-trips records through JSON-lines', () => {
    const records = [
      { id: 1, at: 10, group: 0, subject: 'config' as const, target: 'a.toml', label: 'edit', before: 'b1', after: 'a1', present: true },
      { id: 2, at: 20, group: 1, subject: 'config' as const, target: 'a.toml', label: 'edit', before: 'b2', after: 'a2', present: false },
    ];
    expect(parseJournal(encodeJournal(records))).toEqual(records);
  });

  it('skips blank and corrupt lines without losing the rest', () => {
    const good = encodeJournal([
      { id: 5, at: 1, group: 0, subject: 'config', target: 'x', label: 'l', before: 'a', after: 'b', present: true },
    ]).trim();
    const out = parseJournal(`\ngarbage-not-json\n${good}\n\n`);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(5);
  });

  it('recoverContent reassembles strings and objects', () => {
    expect(parseContent('plain text', false)).toBe('plain text');
    expect(parseContent('{"x":1}', true)).toEqual({ x: 1 });
    expect(parseContent('not-json', true)).toBe('not-json');
  });
});