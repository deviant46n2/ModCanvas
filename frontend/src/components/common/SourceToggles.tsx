export type ModSource = 'modrinth' | 'curseforge'

export const MOD_SOURCES: ModSource[] = ['modrinth', 'curseforge']

const SOURCE_LABEL: Record<ModSource, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
}

interface SourceTogglesProps {
  sources: ModSource[]
  onChange: (sources: ModSource[]) => void
}

/** Multi-select search-source toggles. Zero selected is a legitimate state —
 *  the caller disables search and shows a hint, rather than silently searching
 *  everything or refusing the click. */
export function SourceToggles({ sources, onChange }: SourceTogglesProps) {
  return (
    <div className="source-tabs" role="group" aria-label="Mod search sources">
      {MOD_SOURCES.map((s) => {
        const active = sources.includes(s)
        return (
          <button
            key={s}
            type="button"
            role="checkbox"
            aria-checked={active}
            aria-label={`Search ${SOURCE_LABEL[s]}`}
            className={`source-tab ${active ? 'active' : ''}`}
            onClick={() => {
              const next = active ? sources.filter((x) => x !== s) : [...sources, s]
              onChange(next)
            }}
          >
            {SOURCE_LABEL[s]}
          </button>
        )
      })}
    </div>
  )
}
