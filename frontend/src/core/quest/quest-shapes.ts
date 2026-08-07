export interface ShapeTextures {
  background: string
  outline: string
  shape: string
}

// Canonicalize any shape string to the frontend's shape keys: circle, square,
// rsquare, diamond, pentagon, hexagon, octagon, heart, gear, none. These ARE
// the FTB 1.21 shape ids (verified against the mod's bytecode: circle is first
// and is the fallback). The legacy spellings "rounded_square"/"rounded"/
// "roundedsquare" are NOT shapes in FTB 1.21 — the game resolves them to its
// default (circle) via getOrDefault, so the editor must render circle too
// (fidelity: editor == what the game shows). The real rounded-square key is
// "rsquare" (FTB lang label "Rounded Square"). Empty/"default" resolve to
// circle (FTB's built-in default shape).
export function normalizeShape(shape?: string | null): string {
  const s = (shape || '').trim().toLowerCase()
  if (!s || s === 'default') return 'circle'
  if (s === 'none') return 'none'
  if (s === 'rsquare') return 'rsquare'
  if (s === 'rounded_square' || s === 'rounded' || s === 'roundedsquare') return 'circle'
  return s
}

// Canonical FTB Quests shape → on-disk folder name inside the mod jar
// (`assets/ftbquests/textures/shapes/<folder>/`). `rounded_square` lives in
// the `rsquare` folder (matches FTB's own asset layout). `none` is a real FTB
// shape whose textures are empty (verified in the jar: transparent 128×128) —
// in-game it renders no shape, so it maps to its own folder to produce an
// empty tile instead of falling back to circle. Anything else unknown (empty,
// `default`) falls back to the `circle` folder, matching `normalizeShape`.
const SHAPE_FOLDERS: Record<string, string> = {
  circle: 'circle',
  square: 'square',
  rounded_square: 'rsquare',
  rsquare: 'rsquare',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  heart: 'heart',
  gear: 'gear',
  none: 'none',
}

export function shapeFolder(shape: string): string {
  return SHAPE_FOLDERS[shape] || 'circle'
}

// Texture-index keys for a shape's three layers. These are resolved at runtime
// from the instance's FTB Quests jar via the lazy texture pipeline — never
// bundled with the app. The shape is normalized first (idempotent), so callers
// can pass raw quest-data strings.
export function shapeTextureKeys(shape: string): ShapeTextures {
  const folder = shapeFolder(normalizeShape(shape))
  return {
    background: `ftbquests:textures/shapes/${folder}/background.png`,
    outline: `ftbquests:textures/shapes/${folder}/outline.png`,
    shape: `ftbquests:textures/shapes/${folder}/shape.png`,
  }
}
