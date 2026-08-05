import { useCallback, useEffect, useState } from 'react'
import { searchItems, searchTags } from '../services/api'
import type { SearchResult, TagInfo } from '../services/api'

export function useItemSearch(loader: string, mcVersion: string, enabled = true) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [tagResults, setTagResults] = useState<TagInfo[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setTagResults([])
      return
    }
    setSearching(true)
    try {
      const [items, tags] = await Promise.all([
        searchItems(q, loader, mcVersion),
        searchTags(q, loader, mcVersion),
      ])
      setResults(items)
      setTagResults(tags)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }, [loader, mcVersion])

  useEffect(() => {
    // When disabled (e.g. the instance Registry tab is active) the query is
    // filtered locally and must not trigger remote searches.
    if (!enabled) return
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search, enabled])

  return { query, setQuery, results, tagResults, searching }
}
