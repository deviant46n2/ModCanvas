// Minecraft animated-texture metadata parsing and frame geometry.
//
// In-game animated textures are vertical sprite strips: the PNG is
// `frameWidth × (frameHeight * frameCount)` with an adjacent
// `<texture>.png.mcmeta` JSON (`{ "animation": { ... } }`) controlling the
// timing, frame order and optional interpolation. This module is pure TS (no
// DOM) so the frame math is unit-testable; the actual sprite rendering lives
// in the `AnimatedSprite` component and `services/sprite-sheet.ts`.

export interface AnimationMeta {
  /** Ticks each frame is displayed for (50 ms per tick). Default 1. */
  frameTime?: number
  /** Interpolate between consecutive frames (Minecraft renders one blended
   *  frame per tick during the transition). */
  interpolate?: boolean
  /** Display order as source row indices; defaults to 0..count-1. */
  frames?: number[]
  /** Explicit frame height in px; defaults to the texture width. */
  frameHeight?: number
}

export interface FrameGeometry {
  frameWidth: number
  frameHeight: number
  /** Number of distinct source frames in the strip. */
  count: number
}

const TICKS_MS = 50

/** Parse the raw `.mcmeta` JSON into an `AnimationMeta` (null when absent or
 *  malformed). Minecraft uses `frametime`/`frameheight` in the raw JSON. */
export function parseAnimationMeta(json: string | null | undefined): AnimationMeta | null {
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const anim = (parsed as { animation?: unknown }).animation
  if (!anim || typeof anim !== 'object' || Array.isArray(anim)) return null
  const a = anim as Record<string, unknown>
  const meta: AnimationMeta = {}
  if (typeof a.frametime === 'number' && Number.isFinite(a.frametime) && a.frametime > 0) {
    meta.frameTime = Math.round(a.frametime)
  }
  if (typeof a.interpolate === 'boolean') meta.interpolate = a.interpolate
  if (Array.isArray(a.frames) && a.frames.every((f) => typeof f === 'number')) {
    meta.frames = a.frames.map((f) => Math.max(0, Math.round(f)))
  }
  if (typeof a.frameheight === 'number' && Number.isFinite(a.frameheight) && a.frameheight > 0) {
    meta.frameHeight = Math.round(a.frameheight)
  }
  return meta
}

/** Frame dimensions derived from the source PNG size and the mcmeta. The
 *  default frame height equals the texture width (square frames). */
export function frameGeometry(
  imageWidth: number,
  imageHeight: number,
  meta: AnimationMeta | null,
): FrameGeometry {
  const frameWidth = Math.max(1, imageWidth)
  const frameHeight = meta?.frameHeight && meta.frameHeight > 0
    ? meta.frameHeight
    : Math.max(1, imageWidth)
  const explicit = meta?.frames?.length
  const count = explicit && explicit > 0
    ? explicit
    : Math.max(1, Math.round(imageHeight / frameHeight))
  return { frameWidth, frameHeight, count }
}

/** Display order as source row indices, clamping out-of-range refs. */
export function frameOrder(meta: AnimationMeta | null, count: number): number[] {
  if (meta?.frames && meta.frames.length > 0) {
    const seen = new Set<number>()
    const order: number[] = []
    for (const f of meta.frames) {
      if (f >= 0 && f < count && !seen.has(f)) {
        seen.add(f)
        order.push(f)
      }
    }
    if (order.length > 0) return order
  }
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(i)
  return out
}

/** True when the display order is the natural 0..n-1 (no canvas rebuild). */
export function isSequentialOrder(order: number[]): boolean {
  return order.every((f, i) => f === i)
}

/** Milliseconds each displayed frame is held. Non-interpolated frames are
 *  shown for `frameTime` ticks; interpolated rebuilt frames run at 1 tick. */
export function frameDurationMs(meta: AnimationMeta | null, interpolated: boolean): number {
  if (interpolated) return TICKS_MS
  return (meta?.frameTime ?? 1) * TICKS_MS
}

/** Number of frames in the rebuilt display strip. With interpolation each
 *  transition between consecutive display frames produces `frameTime` blended
 *  frames (one per tick); without it the order array maps 1:1. */
export function rebuiltFrameCount(meta: AnimationMeta | null, order: number[]): number {
  if (!meta?.interpolate) return order.length
  const steps = Math.max(1, meta.frameTime ?? 1)
  return (order.length - 1) * steps + 1
}

export interface InterpolatedStep {
  from: number
  to: number
  t: number
}

/** The blended-frame schedule for an interpolated strip: for every consecutive
 *  pair (a, b) in display order, `frameTime` steps blending from a to b. */
export function interpolatedSteps(meta: AnimationMeta | null, order: number[]): InterpolatedStep[] {
  const steps = Math.max(1, meta?.frameTime ?? 1)
  const out: InterpolatedStep[] = []
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i]
    const to = order[i + 1]
    for (let s = 1; s <= steps; s++) {
      out.push({ from, to, t: s / steps })
    }
  }
  return out
}

/** True when the strip must be rebuilt on a canvas before animating: either
 *  the frames are reordered or interpolation is requested. */
export function needsStripRebuild(meta: AnimationMeta | null, order: number[]): boolean {
  return !!meta?.interpolate || !isSequentialOrder(order)
}
