import type { Node } from '@xyflow/react'

/** Canonical per-type colors — single source for node tiles, edges, minimap,
 *  and phase lanes. A node's own `color` overrides these at render time. */
export const NODE_TYPE_COLORS: Record<string, string> = {
  milestone: '#3b82f6',
  achievement: '#f59e0b',
  unlock: '#8b5cf6',
  phase: '#10b981',
  content: '#ef4444',
  default: '#6b7280',
}

export const nodeTypeColor = (type?: string): string =>
  (type && NODE_TYPE_COLORS[type]) || NODE_TYPE_COLORS.default

/** Phase-lane palette — distinct hues for progression columns. */
export const PHASE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e']

/** Deterministic phase → lane color. Stable across renders and reloads so a
 *  given phase always wears the same hue (no hash reshuffle on re-open). */
export function phaseColor(phase: string): string {
  let hash = 0
  for (let i = 0; i < phase.length; i++) hash = (hash * 31 + phase.charCodeAt(i)) | 0
  return PHASE_COLORS[Math.abs(hash) % PHASE_COLORS.length]
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface PhaseBand {
  id: string
  phase: string
  color: string
  x: number
  y: number
  width: number
  height: number
  count: number
}

const PAD_X = 28
const PAD_TOP = 44 // header room for the lane label
const PAD_BOTTOM = 24
const MIN_BAND_W = 220
const NODE_W = 176 // node tiles are min-width 176px

/** Derive a tinted lane per phase from the real nodes' bounding boxes.
 *  Pure + derived: bands are never persisted, only recomputed from nodes. */
export function computePhaseBands(nodes: Node[]): PhaseBand[] {
  const byPhase = new Map<string, Node[]>()
  for (const n of nodes) {
    const phase = (n.data?.phase as string) || ''
    if (!phase) continue
    const list = byPhase.get(phase) ?? []
    list.push(n)
    byPhase.set(phase, list)
  }

  const bands: PhaseBand[] = []
  for (const [phase, phaseNodes] of byPhase) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of phaseNodes) {
      minX = Math.min(minX, n.position.x)
      maxX = Math.max(maxX, n.position.x + NODE_W)
      minY = Math.min(minY, n.position.y)
      maxY = Math.max(maxY, n.position.y)
    }
    if (!Number.isFinite(minX)) continue
    bands.push({
      id: `band:${phase}`,
      phase,
      color: phaseColor(phase),
      x: minX - PAD_X,
      y: minY - PAD_TOP,
      width: Math.max(maxX - minX + PAD_X * 2, MIN_BAND_W),
      height: maxY - minY + PAD_TOP + PAD_BOTTOM,
      count: phaseNodes.length,
    })
  }
  return bands
}
