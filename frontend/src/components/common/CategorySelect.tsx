// Category filter for the Add Mods search. Modrinth's search API accepts a
// `categories:<slug>` facet (same mechanism as the loader facet), so these
// are their mod-category slugs, labeled for the dropdown. CurseForge has no
// equivalent facet in this flow, so the filter only narrows Modrinth results.
const MODRINTH_CATEGORIES = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'cursed', label: 'Cursed' },
  { value: 'decoration', label: 'Decoration' },
  { value: 'economy', label: 'Economy' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'food', label: 'Food' },
  { value: 'game-mechanics', label: 'Game Mechanics' },
  { value: 'library', label: 'Library' },
  { value: 'magic', label: 'Magic' },
  { value: 'management', label: 'Management' },
  { value: 'misc', label: 'Misc' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'optimization', label: 'Optimization' },
  { value: 'social', label: 'Social' },
  { value: 'storage', label: 'Storage' },
  { value: 'technology', label: 'Technology' },
  { value: 'utility', label: 'Utility' },
  { value: 'worldgen', label: 'Worldgen' },
]

interface CategorySelectProps {
  value: string
  onChange: (category: string) => void
  disabled?: boolean
}

export function CategorySelect({ value, onChange, disabled }: CategorySelectProps) {
  return (
    <select
      className="search-category-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Mod category"
      title="Filter Modrinth results by category"
    >
      <option value="">All categories</option>
      {MODRINTH_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  )
}

// Shown under the search bar when a category is active AND CurseForge is a
// selected source: the category facet is Modrinth-only, so CF is paused for
// that search — otherwise unfiltered CF results would make the filter look
// broken.
export function CategorySourceHint({ categoryActive, curseForgeActive }: { categoryActive: boolean; curseForgeActive: boolean }) {
  if (!categoryActive || !curseForgeActive) return null
  return (
    <div className="search-empty-hint" role="status">
      Category filter is Modrinth-only — CurseForge is paused for this search.
    </div>
  )
}
