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
    path = path
      .replace(/^textures\/(item|block)\//, '')
      .replace(/\.png$/, '');
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
  const key = itemId.replace(/^minecraft:/, '').replace(/^textures\/(item|block)\//, '').replace(/\.png$/, '')
  const result = textureIndex[key] || textureIndex[itemId] || undefined
  if (itemId && !result) {
    console.warn('[getIconUrl] No texture for', itemId, '- key:', key, '- has key?', key in textureIndex, '- has itemId?', itemId in textureIndex);
  }
  return result
}

export function questIconUrl(icon: string, textureIndex: Record<string, string>): string | undefined {
  const key = resolveIconKey(icon)
  if (!key) {
    console.warn('[questIconUrl] empty key from icon:', icon);
    return undefined
  }
  const result = getIconUrl(textureIndex, key)
  if (icon && !result) {
    console.warn('[questIconUrl] No iconUrl for icon:', icon, 'key:', key);
  }
  return result
}
