import { resolveAssetUrl } from '../../services/asset-resolver';
import { isBakedTexture } from '../../services/texture-loader';
import { isEngineConnected } from '../../services/engine-render';

export function resolveIconKey(icon: string): string {
  if (!icon) return ''
  if (icon.includes(':') && !icon.includes('/')) {
    return icon;
  }
  if (!icon.includes(':')) {
    return `minecraft:${icon}`;
  }
  const parts = icon.split(':');
  if (parts.length === 2) {
    const namespace = parts[0];
    let path = parts[1];
    // Strip leading textures/ prefix
    path = path.replace(/^textures\//, '');
    // Strip .png extension
    path = path.replace(/\.png$/, '');
    // Strip item/, block/, model/ prefixes
    if (path.startsWith('block/')) {
      return `${namespace}:${path.substring(6)}`;
    }
    if (path.startsWith('item/')) {
      return `${namespace}:${path.substring(5)}`;
    }
    return `${namespace}:${path}`;
  }
  return icon;
}

export function getIconUrl(textureIndex: Record<string, string>, itemId: string): string | undefined {
  if (!itemId) return undefined
  return resolveAssetUrl(itemId, textureIndex)
}

export function questIconUrl(icon: string, textureIndex: Record<string, string>): string | undefined {
  const key = resolveIconKey(icon)
  if (!key) return undefined
  const url = getIconUrl(textureIndex, key)
  if (!url) return undefined
  // Software-rasterized `bake:` icons (isometric 3D) look nothing like the
  // in-game GUI item. When the companion engine path is active, keep them
  // hidden (pending) until the real engine render lands instead of flashing
  // the blocky stand-in. Once engine-rendered, the key is unmarked as baked
  // and this check stops applying.
  if (isBakedTexture(key) && isEngineConnected()) return undefined
  return url
}
