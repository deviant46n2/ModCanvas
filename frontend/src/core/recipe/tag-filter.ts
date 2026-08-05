// Pure filter for the local tag catalog (the Tags palette tab). A tag id is
// `ns:path`, so `@modid` narrows to a namespace and the rest is a
// case-insensitive substring match over the id. No UI, no IPC — 100% testable.

export interface TagCatalogEntry {
  id: string
  member_count: number
}

export function filterTagCatalog(
  tags: TagCatalogEntry[],
  query: string,
): TagCatalogEntry[] {
  let remaining = query.trim()
  let modFilter: string | undefined
  const modMatch = remaining.match(/@(\S+)/)
  if (modMatch) {
    modFilter = modMatch[1].toLowerCase()
    remaining = remaining.replace(modMatch[0], '').trim()
  }
  const textSearch = remaining.toLowerCase()

  return tags.filter((t) => {
    if (modFilter) {
      const ns = t.id.split(':')[0].toLowerCase()
      if (ns !== modFilter) return false
    }
    if (textSearch && !t.id.toLowerCase().includes(textSearch)) {
      return false
    }
    return true
  })
}
