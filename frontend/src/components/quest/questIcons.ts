import { resolveAssetUrl } from '../../services/asset-resolver';

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
  return getIconUrl(textureIndex, key)
}
