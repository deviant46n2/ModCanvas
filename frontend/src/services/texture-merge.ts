import { isUsableTextureValue } from './texture-loader'
import type { ItemRegistryEntry } from './quest-types'

/**
 * Texture-index merge policies. Extracted from the quest asset pipeline hook
 * so the merge semantics are pure, unit-tested, and reviewable on their own:
 * the "three merge functions, three guard levels" contract (s26).
 *
 * The index maps texture keys → values where the value is one of:
 *   - a compact descriptor (`jar:<abs_path>!<zip>`, `kubejs:<path>`,
 *     `bake:<ns>:<kind>/<path>`) — resolvable offline, or engine-only for bake
 *   - a displayable data URL (`data:…`) — already rendered/materialized
 *   - undefined — not yet known
 */

/// Merge engine-render results, but never let a render CLOBBER an existing
/// displayable value. Engine renders exist for items with NO offline source
/// (`bake:` keys, materialization not-found) — for those, the incoming render
/// replaces the descriptor/undefined. But a flat `jar:` texture that already
/// resolved to a bright data URL (registry `texture_data_url`, materialized
/// URL, or earlier render) is strictly better than a later engine render:
/// the companion renders in-game lighting, which comes back ~50% darker than
/// the jar bytes (s26: flat items went dark after the engine drain). Keep the
/// existing usable value; only write over descriptors/undefined.
export function mergeIndex(prev: Record<string, string>, updates: Record<string, string>): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    if (!v) continue
    const existing = prev[k]
    if (isUsableTextureValue(existing)) continue
    if (existing === v) continue
    merged[k] = v
    changed = true
  }
  return changed ? merged : prev
}

/// Merge only entries that are NEW or unknown — never overwrite an existing
/// displayable data URL with a compact descriptor. The scan/ingest indexes
/// carry `jar:`/`kubejs:`/`bake:` descriptors; blindly spreading them over
/// already-rendered data URLs would flip rendered icons back to placeholders
/// (the texture blink), and re-queue them through the baked-keys effects.
export function mergeIndexNoDowngrade(
  prev: Record<string, string>,
  updates: Record<string, string>,
): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    const existing = prev[k]
    if (existing !== undefined) continue
    if (existing === v) continue
    merged[k] = v
    changed = true
  }
  return changed ? merged : prev
}

/// Upgrade-only merge for materialized data URLs: write when the key is
/// missing or still a compact descriptor, but never clobber an existing
/// displayable value (an engine render may have landed between plan build and
/// apply — overwriting it with a different base64 string would blink the icon).
/// EXCEPTION (s26): a materialized offline URL — which only ever exists for
/// `jar:`/`kubejs:` sources, never `bake:` — MUST overwrite a dark engine
/// render of the same flat item. The engine renders in-game lighting and its
/// flat-item output is ~50% darker than the jar bytes (iron_mesh 216→110);
/// the offline materializer reads the jar directly and is always the
/// authoritative flat texture. bake: keys never materialize offline, so a
/// materialized URL arriving here can never be a bake: item.
export function mergeIndexUpgradeOnly(
  prev: Record<string, string>,
  updates: Record<string, string>,
): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    const existing = prev[k]
    if (!v) continue
    if (existing === v) continue
    if (isUsableTextureValue(existing) && !isUsableTextureValue(v)) continue
    merged[k] = v
    changed = true
  }
  return changed ? merged : prev
}

/** Apply engine-render results to the item registry: fill each item's
 *  `texture_data_url` from the updates map, leaving items that already have a
 *  URL untouched. Reference-stable — returns `prev` when nothing changed, so
 *  consumers that depend on `items` identity (the missing-registry effect, the
 *  canvas) do not re-run on every engine batch result. */
export function withItemTextures(items: ItemRegistryEntry[], updates: Record<string, string>): ItemRegistryEntry[] {
  let changed = false
  const next = items.map((i) => {
    if (i.texture_data_url) return i
    const url = updates[i.id] ?? null
    if (url === i.texture_data_url) return i
    changed = true
    return { ...i, texture_data_url: url }
  })
  return changed ? next : items
}
