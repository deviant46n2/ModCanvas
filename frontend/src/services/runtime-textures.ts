import { invoke } from '@tauri-apps/api/core'
import { wsIpcSendEvent } from './ipc'
import { onCompanionEvent } from './companion-socket'
import type { QuestGraphData } from './quest-types'

/**
 * Runtime texture extraction (companion integration).
 *
 * The offline texture index only contains textures found in jars / kubejs
 * folders. Textures that only exist at runtime (quest backgrounds, chapter
 * images, GUI/theme assets, custom image components) are captured from the
 * in-game ResourceManager via the companion's `EXTRACT_TEXTURES_REQUEST` /
 * `EXTRACT_TEXTURES_RESULT` channels and persisted to a Rust disk cache
 * (`runtime_textures_<hash>.json`, mirroring `engine_renders`).
 *
 * Result textures are keyed by full resource location
 * (`ns:textures/…/name.png`) and merged into the texture index under the same
 * key forms the ingest scan uses, with runtime captures taking precedence.
 */

const listeners = new Set<(textures: Record<string, string>) => void>()
let unlisten: (() => void) | null = null

/** True for keys that reference a texture asset rather than an item id. */
export function isTextureReference(key: string | null | undefined): boolean {
  if (!key) return false
  if (key.startsWith('#') || key.startsWith('http://') || key.startsWith('https://')) return false
  const colon = key.indexOf(':')
  if (colon <= 0) return false
  const path = key.slice(colon + 1)
  if (!path) return false
  if (/\.png$/i.test(path)) return true
  if (path.includes('/textures/')) return true
  if (!path.includes('/')) return false
  const first = path.split('/')[0]
  if (first === 'item' || first === 'block' || first === 'model') return false
  return true
}

/** Namespaces referenced by a quest book's non-item texture assets, plus the
 *  FTB Quests GUI/theme namespace. */
export function questRuntimeNamespaces(graph: QuestGraphData | null): string[] {
  const namespaces = new Set<string>(['ftbquests'])
  if (!graph) return [...namespaces]
  const add = (key?: string | null) => {
    if (!isTextureReference(key)) return
    const colon = (key as string).indexOf(':')
    if (colon > 0) namespaces.add((key as string).slice(0, colon))
  }
  add(graph.book_icon)
  add(graph.book_background_image)
  for (const ch of graph.chapters) {
    add(ch.icon)
    add(ch.background_image)
    for (const img of ch.images || []) add(img.image)
  }
  for (const n of graph.nodes || []) add(n.icon)
  return [...namespaces]
}

/** Expand a full resource location into the key forms the texture index uses. */
export function runtimeTextureKeyForms(location: string): string[] {
  const colon = location.indexOf(':')
  if (colon <= 0) return [location]
  const ns = location.slice(0, colon)
  const rest = location.slice(colon + 1)
  const noExt = rest.replace(/\.png$/i, '')
  const noTextures = noExt.replace(/^textures\//, '')
  return [...new Set([`${ns}:${noTextures}`, `${ns}:${noExt}`, location])]
}

/** Merge extracted runtime textures into an index. Runtime captures win over
 *  the offline index (they are the real in-game appearance). Returns the same
 *  reference when nothing changed so callers can skip re-renders. */
export function mergeRuntimeTextures(
  index: Record<string, string>,
  extracted: Record<string, string>,
): Record<string, string> {
  if (!extracted || Object.keys(extracted).length === 0) return index
  let changed = false
  const out = { ...index }
  for (const [location, url] of Object.entries(extracted)) {
    if (!url || !location) continue
    for (const form of runtimeTextureKeyForms(location)) {
      if (out[form] !== url) {
        out[form] = url
        changed = true
      }
    }
  }
  return changed ? out : index
}

/** Ask the companion to extract runtime textures for the given namespaces. */
export function requestRuntimeTextures(namespaces: string[]): Promise<number> {
  return wsIpcSendEvent('EXTRACT_TEXTURES_REQUEST', undefined, {
    requestId: `rt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    namespaces,
  })
}

/** Subscribe to freshly-extracted runtime textures. */
export function subscribeRuntimeTextures(fn: (textures: Record<string, string>) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Wire the EXTRACT_TEXTURES_RESULT listener once. Returns a cleanup fn. */
export async function initRuntimeTextureListener(): Promise<() => void> {
  if (unlisten) return unlisten
  unlisten = onCompanionEvent((frame) => {
    if (frame.event !== 'EXTRACT_TEXTURES_RESULT') return
    const p = (frame.payload ?? {}) as Record<string, unknown>
    const textures = (p.textures ?? {}) as Record<string, string>
    if (!textures || Object.keys(textures).length === 0) return
    for (const fn of [...listeners]) fn(textures)
  })
  return unlisten
}

/** Load the on-disk runtime-texture cache for an instance. */
export function getRuntimeTextureCache(instance: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_runtime_textures_cmd', { instancePath: instance })
}

/** Persist freshly-extracted runtime textures for an instance. */
export function saveRuntimeTextureCache(
  instance: string,
  textures: Record<string, string>,
): Promise<number> {
  return invoke<number>('save_runtime_textures_cmd', { instancePath: instance, textures })
}

/** Test-only: clear module state. */
export function __resetRuntimeTextureState(): void {
  unlisten = null
}
