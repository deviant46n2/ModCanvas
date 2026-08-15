// Companion item-registry dump parsing (s59). Pure functions — no WS, no I/O.
// The companion sends the game's authoritative BuiltInRegistries.ITEM list as
// `{items: [{id, name}]}`; this converts it to the shared ItemRegistryEntry
// shape and backfills `texture_data_url` from the texture index so the s26
// engine-queue protection survives (a flat item with an offline jar descriptor
// must never be engine-queued, even in the async window before the index
// lands).

import type { ItemRegistryEntry } from './quest-types'
import { withItemTextures } from './texture-merge'

/** A raw companion dump entry: `{id, name}` from ITEM_REGISTRY_RESULT. */
export interface CompanionRegistryItem {
  id: string
  name: string
}

/** Convert a companion dump to registry entries (texture_data_url: null;
 *  backfilled by the caller via the texture index). `mod_id` is derived from
 *  the id namespace — registry namespaces ARE the mod id in Minecraft. */
export function parseCompanionRegistry(raw: CompanionRegistryItem[]): ItemRegistryEntry[] {
  return raw.map((it) => ({
    id: it.id,
    name: it.name || it.id,
    mod_id: it.id.split(':')[0] || 'minecraft',
    texture_data_url: null,
  }))
}

/** Backfill offline texture sources from the texture index (s26 protection). */
export function companionRegistryWithTextures(
  entries: ItemRegistryEntry[],
  textureIndex: Record<string, string>,
): ItemRegistryEntry[] {
  return withItemTextures(entries, textureIndex)
}
