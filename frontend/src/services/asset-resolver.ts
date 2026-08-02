/**
 * Universal texture asset resolver.
 *
 * Accepts any raw SNBT image/icon path and a texture index (Record<string, string>),
 * and returns the matching data URL or undefined.
 *
 * Lookup strategy (in order):
 *   1. Direct key match
 *   2. Stripped .png extension
 *   3. Strip textures/ prefix from path side (e.g. atm:textures/questpics/star → atm:questpics/star)
 *   4. item/ and block/ prefix fallback for bare names
 *   5. Underscore alt key (e.g. atm:textures/questpics/star → atm_textures_questpics_star)
 *   6. Namespace + path variations
 *   7. Case-insensitive fallback (pack refs may use a different case than the
 *      on-disk directory, e.g. atm:textures/questpics/modernindustrialization/*)
 */
export function resolveAssetUrl(
  rawPath: string,
  assetIndex: Record<string, string> | undefined,
): string | undefined {
  if (!rawPath) return undefined;
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  if (!assetIndex) return undefined;

  // Index values that are not displayable (e.g. raw JAR filesystem paths from
  // the ingest engine) are treated as "pending" rather than resolved so the UI
  // falls back to a placeholder until the texture is materialized as a data URL.
  const match = (key: string): string | undefined => {
    const v = assetIndex[key];
    if (!v) return undefined;
    if (v.startsWith('data:') || v.startsWith('http://') || v.startsWith('https://')) return v;
    return undefined;
  };

  // Normalize backslashes
  const p = rawPath.replace(/\\/g, '/');

  // 1. Direct key
  const direct = match(p);
  if (direct) return direct;

  // 2. Without .png
  const noPng = p.replace(/\.png$/i, '');
  const noPngMatch = match(noPng);
  if (noPngMatch) return noPngMatch;

  // 3. Strip textures/ from path side
  const colonIdx = p.indexOf(':');
  if (colonIdx > 0) {
    const ns = p.slice(0, colonIdx);
    const pathPart = p.slice(colonIdx + 1);
    if (pathPart.startsWith('textures/')) {
      const stripped = pathPart.slice('textures/'.length).replace(/\.png$/i, '');
      const joined = `${ns}:${stripped}`;
      const strippedMatch = match(joined);
      if (strippedMatch) return strippedMatch;
    }
    // 4. item/block fallback for bare names
    const bareName = pathPart.startsWith('textures/')
      ? pathPart.slice('textures/'.length).replace(/\.png$/i, '')
      : pathPart.replace(/\.png$/i, '');
    if (bareName && !bareName.includes('/')) {
      const itemMatch = match(`${ns}:item/${bareName}`);
      if (itemMatch) return itemMatch;
      const blockMatch = match(`${ns}:block/${bareName}`);
      if (blockMatch) return blockMatch;
    }
    // 6. Namespace + path variations
    const variations = [
      `${ns}:${pathPart}`,
      `${ns}:${pathPart.replace(/\.png$/i, '')}`,
      `${ns}:textures/${pathPart}`,
      `${ns}:textures/${pathPart.replace(/\.png$/i, '')}`,
    ];
    for (const v of variations) {
      const variationMatch = match(v);
      if (variationMatch) return variationMatch;
    }
  }

  // 5. Underscore alt key
  const altKey = p.replace(/[:/]/g, '_').replace(/\.png$/i, '');
  const altMatch = match(altKey);
  if (altMatch) return altMatch;

  // 7. Case-insensitive fallback. Builds a memoized lowercased key map once per
  // texture index, then retries the normalized forms of every candidate above.
  const folded = p.toLowerCase();
  const foldedIndex = lowercaseKeyIndex(assetIndex);
  const foldedCandidates = [
    folded,
    folded.replace(/\.png$/i, ''),
    altKey.toLowerCase(),
    `${p.slice(0, p.indexOf(':') > 0 ? p.indexOf(':') : 0)}:${p.slice((p.indexOf(':') > 0 ? p.indexOf(':') : 0) + 1)}`.toLowerCase(),
  ];
  for (const fc of foldedCandidates) {
    const hit = foldedIndex.get(fc);
    if (hit) return match(hit);
  }

  return undefined;
}

const lowercaseIndexCache = new WeakMap<Record<string, string>, Map<string, string>>();

function lowercaseKeyIndex(index: Record<string, string>): Map<string, string> {
  let map = lowercaseIndexCache.get(index);
  if (!map) {
    map = new Map<string, string>();
    for (const key of Object.keys(index)) {
      const folded = key.toLowerCase();
      if (!map.has(folded)) map.set(folded, key);
    }
    lowercaseIndexCache.set(index, map);
  }
  return map;
}
