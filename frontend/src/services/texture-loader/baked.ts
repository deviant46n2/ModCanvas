// Software-baked (engine-needed) key tracking. `bake:` descriptor keys are 3D
// isometric renders produced in-game by the companion mod; the UI tracks them
// so their icons scale smoothly (nearest-neighbor downscaling of a 3D render
// looks aliased) and knows when a real engine icon replaces them.

const bakedKeys = new Set<string>()
const bakedSubscribers = new Set<() => void>()

function bumpBakedKeys(): void {
  for (const fn of [...bakedSubscribers]) fn()
}

/**
 * Subscribe to changes in the set of software-baked (engine-needed) keys.
 * Fires when keys are marked baked (new `bake:` descriptors) and when engine
 * renders replace them. Returns an unsubscribe function.
 */
export function subscribeBakedKeys(fn: () => void): () => void {
  bakedSubscribers.add(fn)
  return () => {
    bakedSubscribers.delete(fn)
  }
}

/** Number of texture keys still awaiting a real in-game engine render. */
export function getBakedTextureCount(): number {
  return bakedKeys.size
}

/** Test-only: clear baked-key tracking state. */
export function __resetBakedKeys(): void {
  if (bakedKeys.size > 0) {
    bakedKeys.clear()
    bumpBakedKeys()
  }
}

export function isBakedTexture(key: string): boolean {
  return bakedKeys.has(key)
}

/** All item ids whose icon comes from a software `bake:` render. */
export function getBakedTextureKeys(): string[] {
  return [...bakedKeys]
}

/** Stop treating keys as baked (e.g. after the companion renders a real engine
 * icon for them) so the UI renders them pixelated like regular item icons. */
export function unmarkBakedKeys(keys: Iterable<string>): void {
  let changed = false
  for (const k of keys) {
    if (bakedKeys.delete(k)) changed = true
  }
  if (changed) bumpBakedKeys()
}

export function markBakedKeys(keys: Iterable<string>): void {
  let changed = false
  for (const k of keys) {
    if (!bakedKeys.has(k)) {
      bakedKeys.add(k)
      changed = true
    }
  }
  if (changed) bumpBakedKeys()
}

/** Scan a texture index for `bake:` descriptors and register them as baked so
 *  their rendered icons are scaled smoothly in the UI. */
export function registerBakedKeysFromIndex(textureIndex: Record<string, string>): void {
  markBakedKeys(
    Object.entries(textureIndex)
      .filter(([, src]) => src.startsWith('bake:'))
      .map(([key]) => key),
  )
}
