import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { wsIpcSendEvent } from './ipc'

/**
 * Engine-render pipeline (companion mod integration).
 *
 * When ModCanvas cannot materialize an item icon (its software rasterizer and
 * the texture index both miss), and the game is running with the companion mod
 * connected, we ask the in-game renderer to bake the icon for real and cache
 * the returned base64 PNG. The result is both injected into the live texture
 * index (quest tiles) and persisted on disk via the Rust `engine_renders`
 * cache so it survives restarts.
 */

const BATCH_SIZE = 32
const MAX_ATTEMPTS = 2
const RENDER_SIZE = 64
const BATCH_TIMEOUT_MS = 30_000

let connected = false
let queue: string[] = []
let inFlight = false
let seq = 0
const attempts = new Map<string, number>()
const inflightIds = new Set<string>()
const inflightByReq = new Map<string, string[]>()
const listeners = new Set<(rendered: Record<string, string>) => void>()
const connectSubscribers = new Set<() => void>()
const statsSubscribers = new Set<() => void>()
let unlisten: (() => void) | null = null
let renderedCount = 0
let sentCount = 0

export function getEngineStats(): { connected: boolean; queue: number; inFlight: boolean; sent: number; rendered: number } {
  return { connected, queue: queue.length, inFlight, sent: sentCount, rendered: renderedCount }
}

export function subscribeEngineStats(fn: () => void): () => void {
  statsSubscribers.add(fn)
  return () => {
    statsSubscribers.delete(fn)
  }
}

function bumpStats(): void {
  for (const fn of [...statsSubscribers]) fn()
}

export function setEngineRenderConnected(value: boolean): void {
  if (connected === value) return
  connected = value
  if (value) flush()
  bumpStats()
  for (const fn of [...connectSubscribers]) fn()
}

/** True while the companion is connected (engine renders are being produced). */
export function isEngineConnected(): boolean {
  return connected
}

/** Notify consumers when the engine path toggles (e.g. so icons can re-resolve). */
export function subscribeEngineConnectChange(fn: () => void): () => void {
  connectSubscribers.add(fn)
  return () => {
    connectSubscribers.delete(fn)
  }
}

/** Subscribe to freshly-rendered icons. */
export function subscribeEngineRenders(fn: (rendered: Record<string, string>) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Queue item ids for engine rendering (deduplicated; safe to call often). */
export function queueEngineRenders(ids: string[]): void {
  enqueue(ids, false)
}

/** Like `queueEngineRenders` but items land at the FRONT of the queue so the
 * currently-visible icons are rendered before background/bulk work. */
export function queueEngineRendersPriority(ids: string[]): void {
  enqueue(ids, true)
}

function enqueue(ids: string[], priority: boolean): void {
  if (!ids.length) return
  const fresh = ids.filter((id) => id && !queue.includes(id) && !inflightIds.has(id))
  if (fresh.length === 0) return
  if (priority) {
    queue.unshift(...fresh)
  } else {
    queue.push(...fresh)
  }
  bumpStats()
  flush()
}

function flush(): void {
  if (!connected || inFlight || queue.length === 0) return
  const batch = queue.splice(0, BATCH_SIZE)
  if (batch.length === 0) return
  inFlight = true
  bumpStats()
  const requestId = `er-${++seq}`
  inflightByReq.set(requestId, batch)
  for (const id of batch) inflightIds.add(id)

  wsIpcSendEvent('RENDER_ITEMS_REQUEST', undefined, {
    requestId,
    size: RENDER_SIZE,
    items: batch,
  })
    .then(() => {
      sentCount += batch.length
      bumpStats()
      // eslint-disable-next-line no-console
      console.log(`[engine-render] sent ${batch.length} items (${requestId})`)
    })
    .catch(() => {
      // Broadcast failed (companion dropped). Release the batch for retry.
      releaseBatch(requestId, batch)
    })

  // Safety: if the companion never answers (dropped mid-reconnect), free the
  // batch so the queue keeps moving. Retries are capped by MAX_ATTEMPTS.
  window.setTimeout(() => {
    if (inflightByReq.has(requestId)) {
      releaseBatch(requestId, batch)
    }
  }, BATCH_TIMEOUT_MS)
}

function releaseBatch(requestId: string, batch: string[]): void {
  inflightByReq.delete(requestId)
  for (const id of batch) inflightIds.delete(id)
  for (const id of batch) {
    const a = attempts.get(id) ?? 0
    if (a < MAX_ATTEMPTS) {
      attempts.set(id, a + 1)
      queue.push(id)
    }
  }
  inFlight = false
  flush()
}

/** Normalize a texture-key / bake descriptor to a canonical item id that the
 * companion's `BuiltInRegistries.ITEM` can resolve, or `null` when the key is
 * not item-backed (theme paths, quest pics, bare texture paths). */
export function normalizeItemId(key: string): string | null {
  if (!key) return null
  if (key.startsWith('#') || key.startsWith('mod:')) return null
  if (key.startsWith('http://') || key.startsWith('https://')) return null
  const s = key.startsWith('bake:') ? key.slice('bake:'.length) : key
  const idx = s.indexOf(':')
  if (idx <= 0) return null
  const ns = s.slice(0, idx)
  let path = s.slice(idx + 1).replace(/\.png$/, '')
  if (path.startsWith('textures/')) return null
  if (path.startsWith('item/')) path = path.slice('item/'.length)
  else if (path.startsWith('block/')) path = path.slice('block/'.length)
  else if (path.startsWith('handmodel/')) path = path.slice('handmodel/'.length)
  if (!path) return null
  return `${ns}:${path}`
}

/** Load the on-disk engine-render cache for an instance. */
export function getEngineRenderCache(instance: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_engine_renders_cmd', { instancePath: instance })
}

/** Persist freshly-rendered icons for an instance. */
export function persistEngineRenders(
  instance: string,
  rendered: Record<string, string>,
): Promise<number> {
  return invoke<number>('save_engine_renders_cmd', { instancePath: instance, rendered })
}

/** Wire the RENDER_ITEMS_RESULT listener once. Returns a cleanup fn. */
export async function initEngineRenderListener(): Promise<() => void> {
  if (unlisten) return unlisten
  unlisten = await listen('ws-ipc:event', (event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    if (!payload || payload.event !== 'RENDER_ITEMS_RESULT') return
    const p = (payload.payload ?? {}) as Record<string, unknown>
    const rendered = (p.rendered ?? {}) as Record<string, string>
    const requestId = (p.requestId as string) ?? ''

    const batch = requestId ? inflightByReq.get(requestId) : undefined
    if (batch) {
      inflightByReq.delete(requestId)
      for (const id of batch) inflightIds.delete(id)
      inFlight = false
    }
    // A stale result (already released by timeout) still carries icons worth
    // surfacing, but must not clear the current batch's in-flight flag.

    if (rendered && Object.keys(rendered).length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[engine-render] received ${Object.keys(rendered).length} rendered icons`)
      renderedCount += Object.keys(rendered).length
      bumpStats()
      for (const fn of [...listeners]) fn(rendered)
    }
    flush()
  })
  return unlisten
}

/** True when an id is currently queued or in flight. */
export function isEngineRenderPending(id: string): boolean {
  return queue.includes(id) || inflightIds.has(id)
}

/** Test-only: clear module state. */
export function __resetEngineRenderState(): void {
  queue = []
  inFlight = false
  seq = 0
  attempts.clear()
  inflightIds.clear()
  inflightByReq.clear()
  unlisten = null
}
