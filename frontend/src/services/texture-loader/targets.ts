// Texture-key resolution helpers for the texture loader: which keys a graph
// needs, how to normalize a key to a path/bare name, and path-index lookup.
// Pure functions — no materialization state, no I/O.

import { smartFilterMembers, memberKey } from '../../core/quest/smart-filter'
import { shapeTextureKeys } from '../../core/quest/quest-shapes'
import { TYPE_TEXTURE_KEYS } from '../../core/quest/type-icons'

export function isUsableTextureValue(value: string | null | undefined): boolean {
  return (
    !!value &&
    (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://'))
  )
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
  // Types with a fixed in-game icon (XP → enchanting bottle) carry no target
  // but still need their texture materialized — same plan path as a target.
  if (TYPE_TEXTURE_KEYS[obj.objective_type]) return [TYPE_TEXTURE_KEYS[obj.objective_type]]
  return [obj.target]
}

export function collectNeededTargets(
  graph: import('../quest-types').QuestGraphData | null,
  activeChapter: string | null,
  selectedNode: import('../quest-types').QuestNodeData | null | undefined,
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
      if (TYPE_TEXTURE_KEYS[r.reward_type]) push(TYPE_TEXTURE_KEYS[r.reward_type])
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
      if (TYPE_TEXTURE_KEYS[r.reward_type]) push(TYPE_TEXTURE_KEYS[r.reward_type])
      if (r.smart_filter) {
        for (const key of smartFilterMembers(r.smart_filter).map(memberKey)) push(key)
      }
    }
  }
  return targets
}
