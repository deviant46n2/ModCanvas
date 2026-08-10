// Texture loader facade. The pipeline lives in `./texture-loader/materialize`,
// baked-key tracking in `./texture-loader/baked`, and key-resolution helpers in
// `./texture-loader/targets`; this module re-exports them and hosts the two
// public functions that tie them together.

import { getMaterialized } from './texture-loader/materialize'
import { isUsableTextureValue } from './texture-loader/targets'

export { isUsableTextureValue, keyPathOf, buildTexturePathIndex, findTextureKeysForTarget, collectNeededTargets } from './texture-loader/targets'
export type { TexturePathIndex } from './texture-loader/targets'
export { subscribeMaterialized, subscribeNotFound, getMaterialized, getPendingTextureCount, isTextureLoading, subscribeLoadingChange, requestMaterialize, prefetchAllChapterTextures, textureDisplayUrl } from './texture-loader/materialize'
export { subscribeBakedKeys, getBakedTextureCount, __resetBakedKeys, isBakedTexture, getBakedTextureKeys, unmarkBakedKeys, markBakedKeys, registerBakedKeysFromIndex } from './texture-loader/baked'

/**
 * True when a key exists in the texture index but is not displayable yet
 * (i.e. its compact source hasn't been materialized into a data URL). Only
 * keys that WILL resolve qualify, so unresolvable icons never shimmer forever.
 * `bake:` descriptors are excluded: they are 3D models that can only be
 * rendered in-game by the companion mod and never materialize offline.
 */
export function isTexturePending(
  textureIndex: Record<string, string>,
  key: string,
): boolean {
  if (!key) return false
  if (isUsableTextureValue(textureIndex[key])) return false
  if (getMaterialized(key)) return false
  const src = textureIndex[key]
  if (typeof src === 'string' && src.startsWith('bake:')) return false
  return src !== undefined
}
