// Pack Index frontend contract (P1-PACKINDEX, roadmap §7.3). Mirrors the Rust
// model (`src-tauri/src/pack_index/models.rs` — field names are the serde
// contract; the Rust side serializes camelCase). This is the ONLY place the
// index shape is known on the frontend — components consume these types,
// never raw invoke args.
//
// Usage note: get_pack_index scans the instance (recipes/tags/quests) on
// every call, so callers must go through the per-project memo here — the
// roadmap's "materialized before health, never on-demand inside a recompute"
// placement is the caller's choice, but a picker footer fetching per open
// would rescan per open.

import { invoke } from '@tauri-apps/api/core'

/** A reference from a typed source to an item id (canonical `ns:path`). */
export interface ItemReference {
  source_kind: string
  source_id: string
  item_id: string
}

/** One resolved-or-dead reference finding. Dead = absent from the item registry. */
export interface ReferenceFinding {
  source_kind: string
  source_id: string
  referenced_id: string
  resolved: boolean
}

/** The derived Pack Index. Deterministic: same instance + graph → same index. */
export interface PackIndex {
  items: string[]
  tags: string[]
  references: ItemReference[]
  dead_references: ReferenceFinding[]
  recipe_ids: string[]
  quest_ids: string[]
}

/** Per-project memo so repeated consumers (icon picker, health) never rescan. */
const indexMemo = new Map<string, Promise<PackIndex>>()

/** Fetch (and memoize) the Pack Index for a project. */
export function getPackIndex(projectId: string, kubejsNamespace?: string): Promise<PackIndex> {
  const key = `${projectId}:${kubejsNamespace ?? 'kubejs'}`
  const existing = indexMemo.get(key)
  if (existing) return existing
  const fresh = invoke<PackIndex>('get_pack_index', {
    projectId,
    kubejsNamespace: kubejsNamespace ?? 'kubejs',
  })
  indexMemo.set(key, fresh)
  return fresh
}

/** Invalidate the memo (e.g. after an import/save that changed the graph). */
export function invalidatePackIndex(projectId: string): void {
  for (const key of [...indexMemo.keys()]) {
    if (key.startsWith(`${projectId}:`)) indexMemo.delete(key)
  }
}
