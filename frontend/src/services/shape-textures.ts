import { loadImage } from './sprite-sheet'

const bakeCache = new Map<string, Promise<string | null>>()

// Shape backgrounds are white filled silhouettes with a radial alpha falloff
// (measured: ~0.99 alpha at center → ~0.32 at corners). In-game, the quest tile
// plate is a FLAT, SOLID dark grey — measured (63,63,70) across a 28px run of
// an in-game screenshot (2026-08-09), no gradient, no transparency bleed. The
// editor previously used a center-dark → edge-light gradient at 0.95 alpha,
// which let the blue chapter-background image bleed through the plate and made
// every tile read steel-blue. Fixed: flat opaque fill.
const PLATE_CENTER = 'rgba(63, 63, 70, 1)'
const PLATE_MID = 'rgba(63, 63, 70, 1)'
const PLATE_EDGE = 'rgba(63, 63, 70, 1)'
// The game's outline is a LIGHT GREY (~#6A6A6A–#787878, vision-verified),
// lighter than the center — NOT white, NOT very dark. Quests with an explicit
// color tint the outline to that color instead (like the game).
const DEFAULT_OUTLINE_COLOR = '#6e6e6e'

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
   *  light-grey outline. */
  color?: string | undefined
  /** Square display size in CSS px; the tile is rasterized at this size so the
   *  browser never re-scales it (keeping circles round under every WebView). */
  size: number
}

/** Bake a complete quest shape tile (flat dark-grey plate + tinted outline)
 *  into a single square PNG data URL at the display size. The plate is the
 *  silhouette filled with a flat opaque dark grey via `source-in` (quest
 *  colors tint the center, fading to grey at the rim), then the alpha is
 *  flattened so the editor's chapter background can't bleed through; the
 *  outline is tinted to the quest color (or the default light grey) and drawn
 *  on the rim. Memoized per inputs. Returns null when the textures can't
 *  load or the size is invalid. */
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

  // 1. Plate: the silhouette filled with a FLAT solid dark grey (in-game the
  //    quest tile plate is flat opaque grey, measured (63,63,70); the old
  //    center-dark → edge-light gradient at 0.95 alpha let the blue chapter
  //    background bleed through and read steel-blue). Quests with an explicit
  //    color get the quest color as the center fill at ~55% alpha — the game
  //    tints the whole shape with the quest color, which is why some quests'
  //    tiles read lighter in the center than others (verified: the pack stores
  //    `color:` as a decimal int, e.g. 16755200 = #ffa200; 21 quests have it).
  //    The texture's own alpha falloff (0.99 center → 0.32 corners) defines the
  //    silhouette edge; the outline (step 2) carries the light border.
  let center = PLATE_CENTER
  if (input.color) {
    const rgb = parseHexColor(input.color)
    if (rgb) center = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`
  }
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.75)
  grad.addColorStop(0, center)
  grad.addColorStop(0.72, PLATE_MID)
  grad.addColorStop(1, PLATE_EDGE)
  ctx.drawImage(bgImg, 0, 0, size, size)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'
  // Flatten the plate's alpha: `background.png` carries a radial alpha falloff
  // across the WHOLE tile (measured 111 → 252, i.e. ~43% → ~99%), and source-in
  // preserves it — so over the editor's blue chapter background every plate
  // read steel-blue (in-game renders the plate as a SOLID grey, measured
  // (63,63,70) flat). Threshold the alpha so the interior is opaque and only
  // the silhouette's outer anti-aliased rim stays soft.
  const plateData = ctx.getImageData(0, 0, size, size)
  const dpx = plateData.data
  for (let i = 3; i < dpx.length; i += 4) {
    if (dpx[i] > 40) dpx[i] = 255
  }
  ctx.putImageData(plateData, 0, 0)

  // 2. Outline: the game's outline is a very dark grey, NOT white. The
  //    near-white outline texture is tinted dark (or to the quest color when
  //    set), then drawn at high opacity on the rim.
  let outline = olImg
  const outlineColor = input.color || DEFAULT_OUTLINE_COLOR
  const tinted = await tintTexture(input.outlineUrl, outlineColor)
  if (tinted) {
    try {
      outline = await loadImage(tinted)
    } catch {
      outline = olImg
    }
  }
  ctx.globalAlpha = 0.95
  ctx.drawImage(outline, 0, 0, size, size)
  ctx.globalAlpha = 1

  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
