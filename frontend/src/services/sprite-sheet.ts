import {
  frameGeometry,
  frameOrder,
  needsStripRebuild,
  rebuiltFrameCount,
  interpolatedSteps,
} from '../core/quest/animated-texture'
import type { AnimationMeta } from '../core/quest/animated-texture'

export interface AnimatedSheet {
  /** Data URL of the strip to animate (the original sheet for natural order,
   *  or a rebuilt reordered/interpolated strip). */
  url: string
  /** Number of frames in the display strip. */
  count: number
  /** Source frame height in source px (for strip validation only). */
  frameHeight: number
  /** Whether interpolation was baked into the rebuilt strip. */
  interpolated: boolean
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const sheetCache = new Map<string, Promise<AnimatedSheet | null>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load texture: ${src.slice(0, 32)}…`))
      img.src = src
    })
    imageCache.set(src, p)
  }
  return p
}

/** Prepare an animated sheet for display. When the mcmeta only uses natural
 *  frame order without interpolation the original URL is returned unchanged
 *  (the component animates it with pure CSS); otherwise the frames are drawn
 *  onto a canvas in display order (baking any reordering and interpolation)
 *  and a new strip data URL is returned. Returns null when the image can't
 *  load or yields no usable geometry. */
export function prepareAnimatedSheet(
  url: string,
  meta: AnimationMeta | null,
): Promise<AnimatedSheet | null> {
  const cacheKey = `${url}|${meta ? JSON.stringify(meta) : ''}`
  let p = sheetCache.get(cacheKey)
  if (!p) {
    p = doPrepare(url, meta)
    sheetCache.set(cacheKey, p)
  }
  return p
}

async function doPrepare(url: string, meta: AnimationMeta | null): Promise<AnimatedSheet | null> {
  if (!meta) return null
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } catch {
    return null
  }
  if (!img.naturalWidth || !img.naturalHeight) return null
  const geometry = frameGeometry(img.naturalWidth, img.naturalHeight, meta)
  const order = frameOrder(meta, geometry.count)
  if (order.length <= 1) {
    return { url, count: 1, frameHeight: geometry.frameHeight, interpolated: false }
  }
  if (!needsStripRebuild(meta, order)) {
    return {
      url,
      count: geometry.count,
      frameHeight: geometry.frameHeight,
      interpolated: false,
    }
  }
  const stripUrl = rebuildStrip(img, meta, geometry, order)
  if (!stripUrl) return null
  return {
    url: stripUrl,
    count: rebuiltFrameCount(meta, order),
    frameHeight: geometry.frameHeight,
    interpolated: !!meta.interpolate,
  }
}

function rebuildStrip(
  img: HTMLImageElement,
  meta: AnimationMeta | null,
  geometry: { frameWidth: number; frameHeight: number; count: number },
  order: number[],
): string | null {
  const { frameWidth, frameHeight } = geometry
  const count = rebuiltFrameCount(meta, order)
  const canvas = document.createElement('canvas')
  canvas.width = frameWidth
  canvas.height = frameHeight * count
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const drawRow = (srcRow: number, destRow: number, alpha = 1) => {
    ctx.globalAlpha = alpha
    ctx.drawImage(
      img,
      0,
      srcRow * frameHeight,
      frameWidth,
      frameHeight,
      0,
      destRow * frameHeight,
      frameWidth,
      frameHeight,
    )
  }
  ctx.imageSmoothingEnabled = false
  if (meta?.interpolate) {
    let dest = 0
    for (const { from, to, t } of interpolatedSteps(meta, order)) {
      drawRow(from, dest, 1)
      drawRow(to, dest, t)
      dest++
    }
  } else {
    order.forEach((srcRow, destRow) => drawRow(srcRow, destRow, 1))
  }
  ctx.globalAlpha = 1
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
