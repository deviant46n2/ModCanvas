export interface ShapeTextures {
  background: string
  outline: string
  shape: string
}

// Canonical FTB Quests shape → on-disk folder name inside the mod jar
// (`assets/ftbquests/textures/shapes/<folder>/`). `rounded_square` lives in
// the `rsquare` folder (matches FTB's own asset layout). Anything unknown
// (empty, `default`, `none`) falls back to the `circle` folder, matching
// `normalizeShape` in quest-form-constants.
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
}

export function shapeFolder(shape: string): string {
  return SHAPE_FOLDERS[shape] || 'circle'
}

// Texture-index keys for a shape's three layers. These are resolved at runtime
// from the instance's FTB Quests jar via the lazy texture pipeline — never
// bundled with the app.
export function shapeTextureKeys(shape: string): ShapeTextures {
  const folder = shapeFolder(shape)
  return {
    background: `ftbquests:textures/shapes/${folder}/background.png`,
    outline: `ftbquests:textures/shapes/${folder}/outline.png`,
    shape: `ftbquests:textures/shapes/${folder}/shape.png`,
  }
}
