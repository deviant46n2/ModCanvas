// Pure, deterministic, app-wide history timeline.
//
// Every editing surface (quest canvas, config editor, raw script editor)
// commits into this one ordered sequence, so Ctrl+Z / Ctrl+Y walk the same
// chronological order regardless of which tool produced the last edit. The
// module is truly read-only and side-effect free: no React, no DOM and no disk
// I/O, so it is unit-testable in the Data/Parsers layer.

export type HistorySubject = 'graph' | 'config' | 'text';

// A single logical change. `before`/`after` are the resource states either
// side of the edit; undo restores `before`, redo reapplies `after`.
export interface HistoryEntry<T = unknown, U = unknown> {
  subject: HistorySubject;
  /** Stable identity of the affected resource (a file path or graph id). */
  target: string;
  /** Human-readable label shown in the toolbar / history drawer. */
  label: string;
  before: T;
  after: U;
}

/** An entry committed into the timeline (augmented with sequence bookkeeping). */
export interface CommittedEntry<T = unknown, U = unknown> extends HistoryEntry<T, U> {
  /** Monotonic global sequence number (authoritative across tools). */
  id: number;
  /** Epoch ms at which the group this entry belongs to first started. */
  at: number;
  /** Coalescing group. Gesture-adjacent edits collapse onto one group. */
  group: number;
}

/** Durable, JSON-serialized form of an entry (safe for the journal layer). */
export interface JournalSource {
  id: number;
  at: number;
  group: number;
  subject: HistorySubject;
  target: string;
  label: string;
  /** `before`/`after` flattened to strings; use `parseContent` to recover. */
  before: string;
  after: string;
  /** true when this entry is on the applied side of the undo cursor. */
  present: boolean;
}

export interface HistoryResult {
  /** id of the entry owned by this commit (undefined for a coalesced no-op). */
  entryId?: number;
  /** true when folded into the previous compatible edit's gesture group. */
  coalesced: boolean;
}

export interface HistoryStoreOptions {
  /** Coalesce consecutive edits sharing (subject, target) inside this window. */
  coalesceWindowMs?: number;
  /** Soft cap of entries retained in memory (older ones are trimmed). */
  maxEntries?: number;
}

const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_MAX_ENTRIES = 200;

/** Flatten any payload to a string for durable storage. */
export function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Inverse of `serialize` for journal rehydration. Object payloads were stored
 * as JSON and come back as objects; anything else (plain file text, or an
 * object payload that was invalid JSON) stays a raw string. Callers that need
 * a specific shape (e.g. a config `ConfigValue` tree) should check the type.
 */
export function rehydrate(flattened: string): unknown {
  if (flattened === '') return flattened;
  try {
    return JSON.parse(flattened);
  } catch {
    return flattened;
  }
}

export class HistoryStore {
  private log: CommittedEntry<unknown, unknown>[] = [];
  /** Index of the "present". [0, cursor) is applied history, [cursor, end) redo. */
  private cursor = 0;
  private nextId = 0;
  private nextGroup = 0;
  private ms: number;
  private max: number;

  constructor(opts: HistoryStoreOptions = {}) {
    this.ms = opts.coalesceWindowMs ?? DEFAULT_WINDOW_MS;
    this.max = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Record an edit. Pass `split: true` to force a fresh undo step (e.g. a
   * discrete "add node", "rename") instead of coalescing with the previous
   * compatible edit into one gesture.
   */
  commit<T, U>(entry: HistoryEntry<T, U>, opts: { split?: boolean } = {}): HistoryResult {
    const now = Date.now();
    const last = this.lastApplied();
    const canMerge =
      !opts.split &&
      this.cursor === this.log.length &&
      !!last &&
      last.subject === entry.subject &&
      last.target === entry.target &&
      now - last.at <= this.ms;

    if (canMerge) {
      // Fold into the existing gesture: keep the group's opening `before`,
      // advance `after`, and extend the window so trailing edits keep folding.
      last.after = entry.after;
      last.label = entry.label;
      last.at = now;
      return { coalesced: true };
    }

    this.log.length = this.cursor; // discard any redo branch
    const rec: CommittedEntry = {
      id: this.nextId++,
      at: now,
      group: this.nextGroup++,
      subject: entry.subject,
      target: entry.target,
      label: entry.label,
      before: entry.before,
      after: entry.after,
    };
    this.log.push(rec);
    this.cursor = this.log.length;
    this.trim();
    return { entryId: rec.id, coalesced: false };
  }

  /** Step backward and return the entry whose `before` must be reapplied. */
  undo(): CommittedEntry | undefined {
    if (this.cursor <= 0) return undefined;
    this.cursor -= 1;
    return this.log[this.cursor];
  }

  /** Step forward and return the entry whose `after` must be reapplied. */
  redo(): CommittedEntry | undefined {
    if (this.cursor >= this.log.length) return undefined;
    const entry = this.log[this.cursor];
    this.cursor += 1;
    return entry;
  }

  /** Top entry that would be undone next (for toolbar/button visibility). */
  peekUndo(): CommittedEntry | undefined {
    return this.cursor > 0 ? this.log[this.cursor - 1] : undefined;
  }

  /**
   * Time-travel: move the present cursor to `targetPresent` (0..log.length) in
   * one step. Returns the entries that must be reapplied, in application order:
   * `undoSteps` (newest-first, apply their `before`) when going back, or
   * `redoSteps` (oldest-first, apply their `after`) when going forward.
   */
  jumpTo(targetPresent: number): { undoSteps: CommittedEntry[]; redoSteps: CommittedEntry[] } {
    const target = Math.max(0, Math.min(this.log.length, Math.floor(targetPresent)));
    const undoSteps: CommittedEntry[] = [];
    const redoSteps: CommittedEntry[] = [];
    if (target < this.cursor) {
      for (let i = this.cursor - 1; i >= target; i--) undoSteps.push(this.log[i]);
    } else if (target > this.cursor) {
      for (let i = this.cursor; i < target; i++) redoSteps.push(this.log[i]);
    }
    this.cursor = target;
    return { undoSteps, redoSteps };
  }

  /**
   * Rehydrate the store from a persisted journal snapshot (see `exportJournal`).
   * Rebuilds entries in commit order, restores the presence cursor, and resumes
   * the id/group counters so new commits stay unique.
   */
  loadJournal(records: JournalSource[]): void {
    this.log = [];
    this.cursor = 0;
    let presentCursor = 0;
    let maxId = -1;
    let maxGroup = -1;
    for (const r of records) {
      this.log.push({
        id: r.id,
        at: r.at,
        group: r.group,
        subject: r.subject,
        target: r.target,
        label: r.label,
        before: rehydrate(r.before),
        after: rehydrate(r.after),
      });
      if (r.present) presentCursor = this.log.length;
      if (r.id > maxId) maxId = r.id;
      if (r.group > maxGroup) maxGroup = r.group;
    }
    this.cursor = presentCursor;
    this.nextId = maxId + 1;
    this.nextGroup = maxGroup + 1;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.log.length;
  }

  /** Number of edits that can be undone right now. */
  get undoDepth(): number {
    return this.cursor;
  }

  /** Snapshot for a history drawer (returns copies; `present` mirrors the cursor). */
  snapshot(): { items: CommittedEntry[]; present: number } {
    return { items: this.log.slice(), present: this.cursor };
  }

  /** Durably serialize the timeline (content pre-flattened by `serialize`). */
  exportJournal(): JournalSource[] {
    return this.log.map((e, i) => ({
      id: e.id,
      at: e.at,
      group: e.group,
      subject: e.subject,
      target: e.target,
      label: e.label,
      before: serialize(e.before),
      after: serialize(e.after),
      present: i < this.cursor,
    }));
  }

  private lastApplied(): CommittedEntry | undefined {
    return this.cursor > 0 ? this.log[this.cursor - 1] : undefined;
  }

  private trim(): void {
    if (this.log.length <= this.max) return;
    const excess = this.log.length - this.max;
    this.log.splice(0, excess);
    this.cursor = Math.max(0, this.cursor - excess);
  }
}