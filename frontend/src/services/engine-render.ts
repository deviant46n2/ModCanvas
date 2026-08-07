import { invoke } from '@tauri-apps/api/core'
import { wsIpcSendEvent } from './ipc'
import { onCompanionEvent } from './companion-socket'

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

// One batch in flight at a time (gated by `inFlight`), so the batch size is
// the round-trip granularity: the companion drains the batch, then the next
// batch flushes. 256 keeps round trips large enough to amortize the WS/message
// overhead while still arriving as small per-request results (the companion
// sends one RENDER_ITEMS_RESULT per drained request).
const BATCH_SIZE = 256
const MAX_ATTEMPTS = 2
const RENDER_SIZE = 64
const BATCH_TIMEOUT_MS = 30_000

let connected = false
let queue: string[] = []
/** O(1) membership mirror of `queue` — the queue can hold tens of thousands
 * of ids (full instance registries), and `queue.includes` is O(n), so the
 * dedupe must never scan the array. */
const queueSet = new Set<string>()
/** Ids whose render attempts are spent (never answered by the companion).
 * Terminal for the session: effects re-offering them must not resurrect
 * them, or each re-offer stalls the pipeline for BATCH_TIMEOUT_MS. */
const failed = new Set<string>()
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
  const fresh = ids.filter((id) => id && !queueSet.has(id) && !inflightIds.has(id) && !failed.has(id))
  if (fresh.length === 0) return
  for (const id of fresh) queueSet.add(id)
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
  for (const id of batch) queueSet.delete(id)
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
  // batch so the queue keeps moving. Retries are capped by MAX_ATTEMPTS; an
  // unanswered id is terminal so re-offers can't stall the pipeline.
  window.setTimeout(() => {
    if (inflightByReq.has(requestId)) {
      releaseBatch(requestId, batch, true)
    }
  }, BATCH_TIMEOUT_MS)
}

function releaseBatch(requestId: string, batch: string[], terminalOnExhaust = false): void {
  inflightByReq.delete(requestId)
  for (const id of batch) inflightIds.delete(id)
  for (const id of batch) {
    const a = attempts.get(id) ?? 0
    if (a < MAX_ATTEMPTS) {
      attempts.set(id, a + 1)
      queueSet.add(id)
      queue.push(id)
    } else if (terminalOnExhaust) {
      // Companion is connected but never answered this id — it is not
      // renderable. Mark it failed so the effects re-offering it on every
      // state change can't resurrect it and stall the pipeline.
      failed.add(id)
    }
    // else: non-terminal exhaustion (companion dropped mid-batch). Drop the
    // id quietly; a reconnect may legitimately retry it.
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
  unlisten = onCompanionEvent((frame) => {
    if (frame.event !== 'RENDER_ITEMS_RESULT') return
    const p = (frame.payload ?? {}) as Record<string, unknown>
    const rendered = (p.rendered ?? {}) as Record<string, string>
    const requestId = (p.requestId as string) ?? ''

    const batch = requestId ? inflightByReq.get(requestId) : undefined
    if (batch) {
      inflightByReq.delete(requestId)
      for (const id of batch) inflightIds.delete(id)
      inFlight = false
      // The companion answered this batch — ids it did NOT render are failed
      // attempts. Without this accounting they stay baked/"?", the hook's
      // effects re-offer them on every state change, and the pipeline churns
      // unrenderable ids forever: sent climbs, done crawls. Exhausted ids go
      // terminal (enqueue filters `failed`) exactly like the timeout path.
      const renderedKeys = new Set(Object.keys(p.rendered ?? {}))
      for (const id of batch) {
        if (renderedKeys.has(id)) continue
        const a = attempts.get(id) ?? 0
        if (a < MAX_ATTEMPTS) attempts.set(id, a + 1)
        else failed.add(id)
      }
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
  return queueSet.has(id) || inflightIds.has(id)
}

/** Test-only: clear module state. */
export function __resetEngineRenderState(): void {
  queue = []
  queueSet.clear()
  failed.clear()
  inFlight = false
  seq = 0
  attempts.clear()
  inflightIds.clear()
  inflightByReq.clear()
  unlisten = null
}
