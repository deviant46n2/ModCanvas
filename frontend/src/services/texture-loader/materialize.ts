// Texture materialization pipeline: queues compact source descriptors, asks the
// backend for PNG bytes via `getTextureFiles` in batches, and caches the
// resulting data URLs. Subscribers get notified per batch, on failure, and on
// loading-state transitions. `bake:` keys are excluded — they need the engine.

import { getTextureFiles } from '../recipes'
import { isBakedTexture } from './baked'
import { collectNeededTargets, isUsableTextureValue } from './targets'

const BATCH_SIZE = 500

const materialized = new Map<string, string>()
const notFound = new Map<string, number>()
const MAX_NOT_FOUND_RETRIES = 3
const queued: string[] = []
const queuedSet = new Set<string>()
const subscribers = new Set<(added: string[]) => void>()
const notFoundSubscribers = new Set<(keys: string[]) => void>()
let flushing = false
let loading = false
const loadingSubscribers = new Set<(loading: boolean, remaining: number) => void>()

export function subscribeMaterialized(fn: (added: string[]) => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Subscribe to keys that permanently failed to materialize (retry budget
 * exhausted). These are candidates for engine rendering via the companion
 * mod — the real Minecraft item renderer can bake icons ModCanvas's software
 * rasterizer cannot. */
export function subscribeNotFound(fn: (keys: string[]) => void): () => void {
  notFoundSubscribers.add(fn)
  return () => notFoundSubscribers.delete(fn)
}

function emitNotFound(keys: string[]): void {
  if (keys.length === 0) return
  for (const fn of [...notFoundSubscribers]) fn(keys)
}

export function getMaterialized(key: string): string | undefined {
  return materialized.get(key)
}

export function getPendingTextureCount(): number {
  return queued.length + (flushing ? 1 : 0)
}

export function isTextureLoading(): boolean {
  return loading
}

/**
 * Subscribe to materialization activity. The callback fires when the queue
 * becomes active, on every batch completion (with the remaining count), and
 * when it drains back to idle.
 */
export function subscribeLoadingChange(
  fn: (loading: boolean, remaining: number) => void,
): () => void {
  loadingSubscribers.add(fn)
  return () => loadingSubscribers.delete(fn)
}

function emitLoading(): void {
  const remaining = getPendingTextureCount()
  loading = remaining > 0
  for (const fn of [...loadingSubscribers]) fn(loading, remaining)
}

/** Preferred display URL: already-usable index value, else a materialized data URL. */
export function textureDisplayUrl(
  textureIndex: Record<string, string>,
  key: string,
): string | undefined {
  const v = textureIndex[key]
  if (isUsableTextureValue(v)) return v
  return getMaterialized(key)
}

export function requestMaterialize(keys: string[], instancePath: string): void {
  let added = false
  for (const key of keys) {
    // `bake:` keys can never materialize offline — they need the engine.
    if (isBakedTexture(key)) continue
    if (materialized.has(key) || queuedSet.has(key)) continue
    const attempts = notFound.get(key) ?? 0
    if (attempts >= MAX_NOT_FOUND_RETRIES) continue
    queuedSet.add(key)
    queued.push(key)
    added = true
  }
  if (added) {
    emitLoading()
    flush(instancePath)
  }
}

function flush(instancePath: string): void {
  if (flushing) return
  flushing = true
  const batch = queued.splice(0, BATCH_SIZE)
  for (const key of batch) queuedSet.delete(key)
  if (batch.length === 0) {
    flushing = false
    emitLoading()
    return
  }
  getTextureFiles(batch, instancePath)
    .then((result) => {
      const added: string[] = []
      const exhausted: string[] = []
      for (const key of batch) {
        const url = result[key]
        if (url) {
          materialized.set(key, url)
          notFound.delete(key)
          added.push(key)
        } else {
          const attempts = (notFound.get(key) ?? 0) + 1
          notFound.set(key, attempts)
          if (attempts >= MAX_NOT_FOUND_RETRIES) exhausted.push(key)
        }
      }
      if (added.length > 0) {
        for (const fn of [...subscribers]) fn(added)
      }
      if (exhausted.length > 0) {
        emitNotFound(exhausted)
      }
    })
    .catch((e) => console.error('Texture materialization failed:', e))
    .finally(() => {
      flushing = false
      if (queued.length > 0) {
        flush(instancePath)
      } else {
        emitLoading()
      }
    })
}

/**
 * Background prefetch: queue texture materialization for EVERY chapter and
 * group in the graph (not just the currently-active chapter). Called after the
 * pack loads so that opening the Quests / Chapters screen is instant — the
 * icons are already resident by the time the user navigates there.
 */
export function prefetchAllChapterTextures(
  graph: import('../quest-types').QuestGraphData,
  instancePath: string,
): number {
  // `activeChapter: null` makes collectNeededTargets walk every chapter/node.
  const targets = collectNeededTargets(graph, null, null)
  const pending = targets.filter(
    (t) => t && !materialized.has(t) && !queuedSet.has(t) && (notFound.get(t) ?? 0) < MAX_NOT_FOUND_RETRIES,
  ).length
  requestMaterialize(targets, instancePath)
  return pending
}
