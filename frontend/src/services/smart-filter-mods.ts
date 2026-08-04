import type { ItemRegistryEntry } from './quest-types'

/**
 * Local item registry for smart-filter `mod(...)` members. The item registry
 * (with each entry's `mod_id`) is loaded once per instance via
 * `scanInstanceItems`; `registerModItems` feeds that data in so filter icons
 * can pick a representative item per mod. Mirrors `smart-filter-tags` so the
 * smart filter icon can subscribe and re-render when mods appear.
 */

const modItems = new Map<string, string[]>()
const itemToMod = new Map<string, string>()
const subscribers = new Set<() => void>()
let modVersion = 0

export function subscribeModChanges(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Monotonic counter bumped whenever mod registry state changes. */
export function getModVersion(): number {
  return modVersion
}

/** Representative item ids for a given mod id, or `undefined` if unknown. */
export function getModItems(mod: string): string[] | undefined {
  return modItems.get(mod)
}

export function isModPending(mod: string): boolean {
  return modItems.get(mod) === undefined
}

/** Mod id for a registered item, or `undefined` if the item is unknown. */
export function getItemMod(id: string): string | undefined {
  return itemToMod.get(id)
}

/** Every item id in the registered instance registry, in stable order. */
export function getAllRegisteredItems(): string[] {
  return [...itemToMod.keys()]
}

function emitChanges(): void {
  modVersion += 1
  for (const fn of [...subscribers]) fn()
}

/**
 * Register the instance item registry, indexing items by mod id. Called after
 * `scanInstanceItems` resolves. Representative items default to the first
 * item whose `mod_id` matches; ordering is stable.
 */
export function registerModItems(entries: ItemRegistryEntry[]): void {
  const byMod = new Map<string, string[]>()
  for (const entry of entries) {
    if (!entry.id || !entry.mod_id) continue
    let list = byMod.get(entry.mod_id)
    if (!list) {
      list = []
      byMod.set(entry.mod_id, list)
    }
    list.push(entry.id)
  }
  modItems.clear()
  itemToMod.clear()
  for (const [mod, ids] of byMod) modItems.set(mod, ids)
  for (const entry of entries) {
    if (entry.id && entry.mod_id && !itemToMod.has(entry.id)) {
      itemToMod.set(entry.id, entry.mod_id)
    }
  }
  emitChanges()
}