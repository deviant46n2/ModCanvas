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
const notFound = new Set<string>()
const queued: string[] = []
const queuedSet = new Set<string>()
const subscribers = new Set<(added: string[]) => void>()
let flushing = false
let loading = false
const loadingSubscribers = new Set<(loading: boolean, remaining: number) => void>()

export function subscribeMaterialized(fn: (added: string[]) => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
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
    if (materialized.has(key) || notFound.has(key) || queuedSet.has(key)) continue
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
      for (const key of batch) {
        const url = result[key]
        if (url) {
          materialized.set(key, url)
          added.push(key)
        } else {
          notFound.add(key)
        }
      }
      if (added.length > 0) {
        for (const fn of [...subscribers]) fn(added)
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
