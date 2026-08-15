import type { ItemRegistryEntry } from './quest-types'

/** Parse a browser query: `@modid` narrows to one mod; the rest is a
 *  case-insensitive text search over name + id. */
export function parseItemQuery(query: string): { modFilter?: string; textSearch: string } {
  let remaining = query.trim()
  let modFilter: string | undefined
  const modMatch = remaining.match(/@(\S+)/)
  if (modMatch) {
    modFilter = modMatch[1].toLowerCase()
    remaining = remaining.replace(modMatch[0], '').trim()
  }
  return { modFilter, textSearch: remaining.toLowerCase() }
}

/** Sort registry entries by display name for browsing (s60: the item browser
 *  rendered the live feed in game registration order — white_banner first,
 *  potions/beds buried; name order matches the icon picker's own render sort). */
export function sortRegistryByName(items: ItemRegistryEntry[]): ItemRegistryEntry[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

/** Filter the instance item registry by a browser query. */
export function filterRegistryItems(
  items: ItemRegistryEntry[],
  query: string,
): ItemRegistryEntry[] {
  const { modFilter, textSearch } = parseItemQuery(query)
  return items.filter((item) => {
    if (modFilter) {
      const modMatch =
        item.mod_id.toLowerCase() === modFilter ||
        item.id.toLowerCase().startsWith(modFilter + ':')
      if (!modMatch) return false
    }
    if (textSearch) {
      const nameMatch = item.name.toLowerCase().includes(textSearch)
      const idMatch = item.id.toLowerCase().includes(textSearch)
      if (!nameMatch && !idMatch) return false
    }
    return true
  })
}
