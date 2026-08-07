import { loadImage } from './sprite-sheet'

const bakeCache = new Map<string, Promise<string | null>>()

// Shape backgrounds are white filled silhouettes with a radial alpha falloff
// (measured: ~0.99 alpha at center → ~0.32 at corners). The tile is a DARK
// plate: the silhouette filled with a radial gradient — near-black at the
// center, bright toward the edges. The texture's own alpha falloff caps how
// much of the bright edge shows, but the RELATIVE look is exactly what the
// editor wants: a dark body that lightens toward the rim (the "reversed"
// gradient — center darker, edges lighter).
const PLATE_CENTER = 'rgba(8, 10, 14, 1)'
const PLATE_MID = 'rgba(20, 24, 30, 1)'
const PLATE_EDGE = 'rgba(190, 200, 215, 1)'

export function parseHexColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const m6 = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (m6) {
    const hex = m6[1]
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 255,
    }
  }
  // FTB colors are ARGB when 8 digits (e.g. `quest_not_started_color:
  // #96FFFFFF` = white at 58% alpha), so alpha comes first.
  const m8 = /^#?([0-9a-f]{8})$/i.exec(color.trim())
  if (m8) {
    const hex = m8[1]
    return {
      a: parseInt(hex.slice(0, 2), 16),
      r: parseInt(hex.slice(2, 4), 16),
      g: parseInt(hex.slice(4, 6), 16),
      b: parseInt(hex.slice(6, 8), 16),
    }
  }
  return null
}

/** Tint a near-white texture (like FTB's outline) to an exact hex color by
 *  drawing it onto a canvas and filling through its alpha channel with
 *  `source-in`. Deterministic and identical across all WebViews, unlike CSS
 *  `filter`/`mask-image` tinting. Returns null when the image can't load. */
export function tintTexture(url: string, color: string): Promise<string | null> {
  const cacheKey = `tint|${url}|${color}`
  let p = bakeCache.get(cacheKey)
  if (!p) {
    p = doTint(url, color)
    bakeCache.set(cacheKey, p)
  }
  return p
}

async function doTint(url: string, color: string): Promise<string | null> {
  const rgb = parseHexColor(color)
  if (!rgb) return null
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } catch {
    return null
  }
  if (!img.naturalWidth || !img.naturalHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a / 255})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export interface ShapeTileInput {
  backgroundUrl: string
  outlineUrl: string
  /** Quest color (hex) to tint the outline, or undefined for the default
   *  near-white outline. */
  color?: string | undefined
  /** Square display size in CSS px; the tile is rasterized at this size so the
   *  browser never re-scales it (keeping circles round under every WebView). */
  size: number
}

/** Bake a complete quest shape tile (dark plate + tinted/white outline) into a
 *  single square PNG data URL at the display size. The plate is the silhouette
 *  filled with a center-dark → edge-bright radial gradient via `source-in`
 *  (the requested "darker center, lighter edges" look), then the outline is
 *  composited on top. Memoized per inputs. Returns null when the
 *  textures can't load or the size is invalid. */
export function bakeShapeTile(input: ShapeTileInput): Promise<string | null> {
  const cacheKey = `tile|${input.backgroundUrl}|${input.outlineUrl}|${input.color || ''}|${input.size}`
  let p = bakeCache.get(cacheKey)
  if (!p) {
    p = doBake(input)
    bakeCache.set(cacheKey, p)
  }
  return p
}

async function doBake(input: ShapeTileInput): Promise<string | null> {
  const size = Math.round(input.size)
  if (!Number.isFinite(size) || size < 16) return null
  let [bgImg, olImg] = [null as HTMLImageElement | null, null as HTMLImageElement | null]
  try {
    const [bg, ol] = await Promise.all([loadImage(input.backgroundUrl), loadImage(input.outlineUrl)])
    if (!bg.naturalWidth || !bg.naturalHeight || !ol.naturalWidth || !ol.naturalHeight) return null
    bgImg = bg
    olImg = ol
  } catch {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Smooth scaling keeps the shape silhouette and thin outline continuous when
  // the 128px source textures are downscaled to small quest tiles.
  ctx.imageSmoothingEnabled = true

  // 1. Plate: the silhouette filled with a radial gradient — near-black in
  //    the center, bright toward the rim. `source-in` keeps the silhouette's
  //    alpha (0.99 center → 0.32 corners), so the center reads solid-dark and
  //    the edges read lighter: the requested "darker center, lighter edges".
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.75)
  grad.addColorStop(0, PLATE_CENTER)
  grad.addColorStop(0.72, PLATE_MID)
  grad.addColorStop(1, PLATE_EDGE)
  ctx.drawImage(bgImg, 0, 0, size, size)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'

  // 2. Outline: tinted to the quest color when set, else the near-white
  //    texture (a thin ring; at most it adds a faint bright stroke on the rim).
  let outline = olImg
  if (input.color) {
    const tinted = await tintTexture(input.outlineUrl, input.color)
    if (tinted) {
      try {
        outline = await loadImage(tinted)
      } catch {
        outline = olImg
      }
    }
  }
  ctx.globalAlpha = 0.9
  ctx.drawImage(outline, 0, 0, size, size)
  ctx.globalAlpha = 1

  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
