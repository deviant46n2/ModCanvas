import { isUsableTextureValue } from '../../services/texture-loader'

export interface TextureCandidate {
  key: string
  url: string
}

const DECORATION_MARKERS = [
  'questpic', 'deco', 'decoration', 'chapter', 'background',
  'quest', 'book', 'title', 'divider', 'corner', 'frame', 'star',
]

function normalizedPath(key: string): string {
  const colonIdx = key.indexOf(':')
  const rest = colonIdx >= 0 ? key.slice(colonIdx + 1) : key
  let p = rest.replace(/\\/g, '/').replace(/^textures\//, '').replace(/\.png$/i, '')
  return p.toLowerCase()
}

export function isDecorationKey(key: string): boolean {
  const p = normalizedPath(key)
  if (!p) return false
  if (/\/(item|block|model|entity|gui|font|particle|misc|environment|painting)\//.test(`/${p}`)) {
    return false
  }
  return DECORATION_MARKERS.some((m) => p.includes(m))
}

export function decorationCandidates(
  textureIndex: Record<string, string>,
  limit = 400,
): TextureCandidate[] {
  const out: TextureCandidate[] = []
  for (const key of Object.keys(textureIndex)) {
    const url = textureIndex[key]
    if (!isUsableTextureValue(url)) continue
    if (!isDecorationKey(key)) continue
    out.push({ key, url })
  }
  out.sort((a, b) => a.key.localeCompare(b.key))
  return out.slice(0, limit)
}

export function searchTextureCandidates(
  textureIndex: Record<string, string>,
  query: string,
  limit = 200,
): TextureCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return decorationCandidates(textureIndex, limit)
  const out: TextureCandidate[] = []
  for (const key of Object.keys(textureIndex)) {
    const url = textureIndex[key]
    if (!isUsableTextureValue(url)) continue
    const p = normalizedPath(key)
    if (!p.includes(q)) continue
    if (/\/(item|block|model|entity|gui|font|particle)\//.test(`/${p}`)) continue
    out.push({ key, url })
  }
  out.sort((a, b) => {
    const aP = normalizedPath(a.key)
    const bP = normalizedPath(b.key)
    const aStart = aP.startsWith(q) ? 0 : 1
    const bStart = bP.startsWith(q) ? 0 : 1
    if (aStart !== bStart) return aStart - bStart
    return a.key.localeCompare(b.key)
  })
  return out.slice(0, limit)
}

export function defaultDecorationImage(key: string): ChapterImageLike {
  return {
    image: key,
    x: 0,
    y: 0,
    width: 8,
    height: 4,
    rotation: 0,
    scale: 1,
    order: 0,
    alpha: 255,
    color: 0,
    click: '',
    hover: [],
  }
}

export interface ChapterImageLike {
  image: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scale: number
  order: number
  alpha: number
  color: number
  click: string
  hover: string[]
}

export interface ChapterImageRect {
  left: number
  top: number
  width: number
  height: number
}

// FTB Quests renders chapter images with their stored x/y at the CENTER of the
// box (unless the image is corner-aligned) and stretches the texture to fill
// it. The box width/height use the same "quest unit" as a quest node size (a
// 1.0 quest = one cell), while x/y positions are on the chapter grid pitch.
// Mirroring that split keeps decorations 1:1 with the quest nodes they frame:
// `positionScale` maps grid coords, `bodyScale` maps width/height.
export function chapterImageRect(
  img: Pick<ChapterImageLike, 'x' | 'y' | 'width' | 'height'>,
  opts: { positionScale: number; bodyScale: number },
): ChapterImageRect {
  const width = img.width * opts.bodyScale
  const height = img.height * opts.bodyScale
  return {
    left: img.x * opts.positionScale - width / 2,
    top: img.y * opts.positionScale - height / 2,
    width,
    height,
  }
}
