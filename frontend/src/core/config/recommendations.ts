// P2-CONFIG — plain-language config recommendations (roadmap §12). Pure:
// a small, maintained, community-extensible list of "the tweak most people
// want" entries, each mapping plain-language intent to a real config file
// + key path + typed value. The wizard searches this list FIRST; a match
// opens the file and applies through the editor's own history+save path
// (so every recommendation is undoable by the existing Undo button).
//
// Fidelity rules:
//  - A recommendation's `file` is a filename matcher (case-insensitive
//    substring) because config paths vary by pack/version. Search surfaces
//    a recommendation only when the target file is PRESENT in the pack's
//    scanned files — no dead ends, no applying to files that don't exist.
//  - `path` is the key path inside the file (dot-joined for display).
//  - `value` is a typed ConfigValue; the wizard renders it with the same
//    typed fields as the editor, and apply goes through onApply.
//  - Adding a recommendation = one array entry + a test. Keep entries tiny:
//    this list is maintained data, not an exhaustive catalog (roadmap §12
//    risk: "recommendation-file maintenance burden — keep it tiny").

import type { ConfigValue } from './types'

export interface ConfigRecommendation {
  /** Stable id, e.g. `keep-inventory`. */
  id: string
  /** Plain-language phrases people type ("keep inventory", "don't lose items on death"). */
  phrases: string[]
  /** Filename the tweak lives in, e.g. "server.properties" (case-insensitive substring). */
  file: string
  /** Key path inside that file. */
  path: string[]
  /** The typed value to write. */
  value: ConfigValue
  /** One-line human explanation shown on the card. */
  why: string
  /** Mod namespace the tweak belongs to (grouping label). */
  mod: string
}

/** The maintained recommendation list. Tiny by design — add one entry + a
 *  test; search + apply need no other wiring. */
export const CONFIG_RECOMMENDATIONS: ConfigRecommendation[] = [
  {
    id: 'keep-inventory',
    phrases: ['keep inventory', "don't lose items on death", 'keep items when dying'],
    file: 'server.properties',
    path: ['keepInventory'],
    value: { type: 'boolean', value: true },
    why: 'Players keep their items on death (server property, applies to all players).',
    mod: 'vanilla',
  },
  {
    id: 'difficulty-hard',
    phrases: ['make it harder', 'hard difficulty', 'tougher enemies'],
    file: 'server.properties',
    path: ['difficulty'],
    value: { type: 'string', value: 'hard' },
    why: 'Sets the world difficulty to hard.',
    mod: 'vanilla',
  },
  {
    id: 'command-blocks',
    phrases: ['enable command blocks', 'use command blocks', 'allow command blocks'],
    file: 'server.properties',
    path: ['enable-command-block'],
    value: { type: 'boolean', value: true },
    why: 'Lets command blocks run (needed for redstone command-block contraptions).',
    mod: 'vanilla',
  },
  {
    id: 'pvp-off',
    phrases: ['turn off pvp', 'disable player combat', 'no pvp', 'peaceful server'],
    file: 'server.properties',
    path: ['pvp'],
    value: { type: 'boolean', value: false },
    why: 'Disables player-vs-player damage on the server.',
    mod: 'vanilla',
  },
  {
    id: 'spawn-protection',
    phrases: ['stop spawn griefing', 'protect spawn area', 'no griefing near spawn'],
    file: 'server.properties',
    path: ['spawn-protection'],
    value: { type: 'number', value: 0 },
    why: 'Removes the spawn protection radius so players can build anywhere near spawn.',
    mod: 'vanilla',
  },
  {
    id: 'view-distance',
    phrases: ['see further', 'longer render distance', 'view distance'],
    file: 'server.properties',
    path: ['view-distance'],
    value: { type: 'number', value: 16 },
    why: 'Raises the server-side chunk view distance (client render distance must match or exceed it).',
    mod: 'vanilla',
  },
]

/** Normalize a query/string for matching: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Does a recommendation's file exist among the pack's scanned files? */
export function recommendationFilePresent(rec: ConfigRecommendation, files: readonly string[]): boolean {
  const needle = norm(rec.file)
  return files.some((f) => norm(f).includes(needle))
}

/**
 * Search the recommendation list. Returns recommendations whose target file
 * is present in the pack AND whose phrases match the query (any phrase
 * contains every query token). Deterministic: list order, then by match
 * strength. No matches → empty (the wizard falls back to the manual path).
 */
export function searchRecommendations(
  query: string,
  configFiles: readonly string[],
  recommendations: readonly ConfigRecommendation[] = CONFIG_RECOMMENDATIONS,
): ConfigRecommendation[] {
  const q = norm(query)
  if (!q) return []
  const tokens = q.split(' ')
  const present = recommendations.filter((r) => recommendationFilePresent(r, configFiles))
  const scored: { rec: ConfigRecommendation; score: number }[] = []
  for (const rec of present) {
    let best = 0
    for (const phrase of rec.phrases) {
      const p = norm(phrase)
      if (tokens.every((t) => p.includes(t))) {
        // Exact phrase wins; otherwise length-normalized containment.
        best = Math.max(best, p === q ? 3 : 2)
      }
    }
    if (best > 0) scored.push({ rec, score: best })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.rec)
}
