import { getTextureFiles } from './recipes'
import type { QuestGraphData, QuestNodeData } from './quest-types'
import { smartFilterMembers, memberKey } from '../core/quest/smart-filter'
import { shapeTextureKeys } from '../core/quest/quest-shapes'

const BATCH_SIZE = 200

export function isUsableTextureValue(value: string | null | undefined): boolean {
  return (
    !!value &&
    (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://'))
  )
}

/**
 * True when a key exists in the texture index but is not displayable yet
 * (i.e. its compact source hasn't been materialized into a data URL). Only
 * keys that WILL resolve qualify, so unresolvable icons never shimmer forever.
 */
export function isTexturePending(
  textureIndex: Record<string, string>,
  key: string,
): boolean {
  if (!key) return false
  if (isUsableTextureValue(textureIndex[key])) return false
  if (getMaterialized(key)) return false
  return textureIndex[key] !== undefined
}

export function keyPathOf(key: string): string {
  const colonIdx = key.indexOf(':')
  const rest = colonIdx >= 0 ? key.slice(colonIdx + 1) : key
  let p = rest.replace(/\\/g, '/')
  p = p.replace(/^textures\//, '')
  p = p.replace(/\.png$/i, '')
  return p
}

export interface TexturePathIndex {
  byPath: Map<string, string[]>
  byBare: Map<string, string[]>
}

export function buildTexturePathIndex(keys: Iterable<string>): TexturePathIndex {
  const byPath = new Map<string, string[]>()
  const byBare = new Map<string, string[]>()
  const addTo = (map: Map<string, string[]>, k: string, v: string) => {
    const arr = map.get(k)
    if (arr) arr.push(v)
    else map.set(k, [v])
  }
  for (const key of keys) {
    const p = keyPathOf(key)
    addTo(byPath, p, key)
    const bare = p.split('/').pop()
    if (bare) addTo(byBare, bare, key)
  }
  return { byPath, byBare }
}

export function findTextureKeysForTarget(
  index: TexturePathIndex,
  canonical: string,
): string[] {
  const colonIdx = canonical.indexOf(':')
  const ns = colonIdx > 0 ? canonical.slice(0, colonIdx) : ''
  const p = keyPathOf(canonical)
  const bare = p.split('/').pop() || ''
  const out: string[] = []
  const seen = new Set<string>()
  const add = (k: string) => {
    if (seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  const addNsFiltered = (keys: string[]) => {
    for (const k of keys) {
      if (!ns || k.split(':')[0] === ns) add(k)
    }
  }
  addNsFiltered(index.byPath.get(p) || [])
  if (!p.includes('/')) {
    for (const prefix of ['item', 'block', 'model']) {
      addNsFiltered(index.byPath.get(`${prefix}/${bare}`) || [])
    }
  }
  if (ns) addNsFiltered(index.byBare.get(bare) || [])
  return out
}

function objectiveTargets(obj: {
  objective_type: string
  target: string
  item_tag: string
  smart_filter?: string
  fluid_id: string
  entity_id: string
}): string[] {
  if (obj.smart_filter) {
    return [obj.target, obj.item_tag, ...smartFilterMembers(obj.smart_filter).map(memberKey)]
  }
  if (['item', 'item_acquisition', 'item_retrieval', 'item_crafting', 'block_break', 'block_place'].includes(obj.objective_type)) {
    return [obj.target, obj.item_tag]
  }
  if (obj.objective_type === 'fluid') return [obj.fluid_id]
  if (obj.objective_type === 'entity_kill') return [obj.entity_id]
  return [obj.target]
}

export function collectNeededTargets(
  graph: QuestGraphData | null,
  activeChapter: string | null,
  selectedNode: QuestNodeData | null | undefined,
): string[] {
  if (!graph) return []
  const targets: string[] = []
  const push = (t?: string | null) => {
    if (t && !targets.includes(t)) targets.push(t)
  }
  for (const ch of graph.chapters) {
    push(ch.icon)
    push(ch.background_image)
    for (const img of ch.images || []) push(img.image)
  }
  const visible = activeChapter
    ? graph.nodes.filter((n) => n.chapter_id === activeChapter)
    : graph.nodes
  for (const n of visible) {
    push(n.icon)
    // Shape textures (background/outline/shape) come from the instance's FTB
    // Quests jar and must be materialized too.
    const shapeKeys = shapeTextureKeys(n.shape || 'circle')
    push(shapeKeys.background)
    push(shapeKeys.outline)
    push(shapeKeys.shape)
    for (const o of n.objectives || []) {
      for (const t of objectiveTargets(o)) push(t)
    }
    for (const r of n.rewards || []) {
      push(r.item_id || r.items?.[0] || r.item_tag)
      if (r.smart_filter) {
        for (const key of smartFilterMembers(r.smart_filter).map(memberKey)) push(key)
      }
    }
  }
  if (selectedNode) {
    for (const o of selectedNode.objectives || []) {
      for (const t of objectiveTargets(o)) push(t)
    }
    for (const r of selectedNode.rewards || []) {
      push(r.item_id || r.items?.[0] || r.item_tag)
      if (r.smart_filter) {
        for (const key of smartFilterMembers(r.smart_filter).map(memberKey)) push(key)
      }
    }
  }
  return targets
}

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

/// Keys whose source is a `bake:` descriptor. These are synthetic 3D isometric
/// renders (NOT 16px Minecraft textures) and should be scaled smoothly in the
/// UI — nearest-neighbor downscaling of a 3D render looks aliased, whereas
/// smooth scaling keeps it clean.
const bakedKeys = new Set<string>()

export function isBakedTexture(key: string): boolean {
  return bakedKeys.has(key)
}

/** All item ids whose icon comes from a software `bake:` render. */
export function getBakedTextureKeys(): string[] {
  return [...bakedKeys]
}

/** Stop treating keys as baked (e.g. after the companion renders a real engine
 * icon for them) so the UI renders them pixelated like regular item icons. */
export function unmarkBakedKeys(keys: Iterable<string>): void {
  for (const k of keys) bakedKeys.delete(k)
}

export function markBakedKeys(keys: Iterable<string>): void {
  for (const k of keys) bakedKeys.add(k)
}

/** Scan a texture index for `bake:` descriptors and register them as baked so
 *  their rendered icons are scaled smoothly in the UI. */
export function registerBakedKeysFromIndex(textureIndex: Record<string, string>): void {
  for (const [key, src] of Object.entries(textureIndex)) {
    if (src.startsWith('bake:')) bakedKeys.add(key)
  }
}

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
  graph: import('./quest-types').QuestGraphData,
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
