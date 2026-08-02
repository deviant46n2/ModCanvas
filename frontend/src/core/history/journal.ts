// Pure codec for the durable history journal.
//
// The journal is a JSON-lines ("jsonl") stream: one compact record per line, in
// commit order. A driver/frontend module reads a store's `exportJournal()` and
// writes these lines atomically; on load it parses them back so the full pack
// edit history survives app restarts. This file performs no file I/O, staying
// in the pure Data/Parsers layer.
import type { JournalSource } from './store';

/** A journal record as stored on disk (one JSON object per line). */
export type JournalRecord = JournalSource;

/**
 * Serialize journal records to JSON-lines text. Empty `records` yields an
 * empty string. Every non-empty record is written on its own `\n`-terminated
 * line, so the output is stable and diff-friendly.
 */
export function encodeJournal(records: JournalRecord[]): string {
  let out = '';
  for (const record of records) {
    out += JSON.stringify(record) + '\n';
  }
  return out;
}

/**
 * Parse JSON-lines text back into records, ignoring blank lines and, for
 * robustness, skipping malformed lines individually rather than failing the
 * whole file (one corrupt line must not lose the rest of the journal).
 */
export function parseJournal(text: string): JournalRecord[] {
  const records: JournalRecord[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    try {
      records.push(JSON.parse(line) as JournalRecord);
    } catch {
      // Skip the corrupt line; keep the rest of the journal intact.
    }
  }
  return records;
}

/**
 * Recover a flattened `before`/`after` payload. String-typed payloads come
 * back as the original `string`; object payloads are reparsed as JSON. Values
 * that were flattened as JSON but fail to reparse are returned as the raw
 * string so a consumer can treat them as opaque.
 */
export function parseContent(flattened: string, isObjectPayload: boolean): unknown {
  if (!isObjectPayload) return flattened;
  try {
    return JSON.parse(flattened);
  } catch {
    return flattened;
  }
}