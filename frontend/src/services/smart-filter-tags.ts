import { invoke } from '@tauri-apps/api/core'
import { requestMaterialize } from './texture-loader'

/**
 * Local item-tag resolution backed by the `resolve_item_tags` Rust command,
 * which reads `data/<ns>/tags/item(s)/<name>.json` from the instance's jars,
 * resource packs, `data/`, and `kubejs/data`. Results are cached per process;
 * resolved item ids are fed into the texture materialization queue so their
 * icons show.
 */

const tagItems = new Map<string, string[]>()
const tagPending = new Map<string, boolean>()
const subscribers = new Set<() => void>()
let tagVersion = 0

export function subscribeTagChanges(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Monotonic counter bumped whenever tag cache state changes. */
export function getTagVersion(): number {
  return tagVersion
}

export function getTagItems(tag: string): string[] | undefined {
  return tagItems.get(tag)
}

export function isTagPending(tag: string): boolean {
  return tagPending.get(tag) ?? false
}

export async function resolveItemTags(
  instancePath: string,
  tags: string[],
): Promise<Record<string, string[]>> {
  return invoke<Record<string, string[]>>('resolve_item_tags', { instancePath, tags })
}

function emitChanges(): void {
  tagVersion += 1
  for (const fn of [...subscribers]) fn()
}

/**
 * Request expansion of tags that haven't been resolved yet. Resolved item ids
 * are cached and their textures materialized. Safe to call repeatedly.
 */
export function requestResolveTags(tags: string[], instancePath: string): void {
  const missing = tags.filter(t => !tagItems.has(t) && !tagPending.get(t))
  if (missing.length === 0) return
  for (const t of missing) tagPending.set(t, true)
  emitChanges()
  resolveItemTags(instancePath, missing)
    .then(result => {
      const toMaterialize: string[] = []
      for (const [tag, items] of Object.entries(result)) {
        tagItems.set(tag, items)
        tagPending.delete(tag)
        for (const item of items) {
          if (item && !item.startsWith('#')) toMaterialize.push(item)
        }
      }
      if (toMaterialize.length > 0) {
        requestMaterialize(toMaterialize, instancePath)
      }
    })
    .catch(err => {
      console.error('Item tag resolution failed:', err)
      for (const t of missing) tagPending.delete(t)
    })
    .finally(() => emitChanges())
}
