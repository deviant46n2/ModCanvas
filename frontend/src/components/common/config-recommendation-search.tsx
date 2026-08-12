import * as React from 'react'
import { useMemo } from 'react'
import type { ConfigFileInfo } from '../../core/config/types'
import type { ConfigRecommendation } from '../../core/config/recommendations'
import { CONFIG_RECOMMENDATIONS, recommendationFilePresent, searchRecommendations } from '../../core/config/recommendations'

/**
 * P2-CONFIG step 0: plain-language recommendation search. Searches the
 * curated list ("keep inventory", "turn off pvp"…) — NOT the open file's
 * keys. Only recommendations whose target file exists in the pack appear
 * (no dead ends). Picking one opens its file and applies through the
 * editor's own path (undoable). Pure + presentational: no I/O, no state
 * beyond the query.
 */
export function ConfigRecommendationSearch({
  configFiles,
  onPick,
  onSearchFiles,
}: {
  configFiles: ConfigFileInfo[]
  onPick: (rec: ConfigRecommendation) => void
  onSearchFiles: () => void
}) {
  const [query, setQuery] = React.useState('')

  const matches = useMemo(() => {
    const paths = configFiles.map((f) => f.path)
    return searchRecommendations(query, paths)
  }, [query, configFiles])

  return (
    <div className="guided-config-step">
      <p className="guided-config-hint">
        What do you want to change? Describe it in plain words — or{' '}
        <button type="button" className="guided-config-link" onClick={onSearchFiles}>
          search config files
        </button>{' '}
        directly.
      </p>
      <input
        type="text"
        className="guided-config-search"
        placeholder="e.g. keep inventory, turn off pvp, protect spawn…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="guided-config-recs">
        {query.trim() && matches.length === 0 && (
          <p className="guided-config-hint">
            No recommended tweaks match “{query}”. Try a different phrase, or search config files directly.
          </p>
        )}
        {!query.trim() && (
          <p className="guided-config-hint">
            Popular tweaks below — pick one, or type your own.
          </p>
        )}
        {matches.map((rec) => (
          <RecommendationCard key={rec.id} rec={rec} onPick={onPick} />
        ))}
        {!query.trim() && (
          <div className="guided-config-rec-popular">
            {CONFIG_RECOMMENDATIONS.filter((r) =>
              recommendationFilePresent(r, configFiles.map((f) => f.path)),
            )
              .slice(0, 4)
              .map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} onPick={onPick} />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({
  rec,
  onPick,
}: {
  rec: ConfigRecommendation
  onPick: (rec: ConfigRecommendation) => void
}) {
  return (
    <button className="guided-config-rec" onClick={() => onPick(rec)}>
      <span className="guided-config-rec-title">{rec.phrases[0]}</span>
      <span className="guided-config-rec-why">{rec.why}</span>
      <em className="guided-config-rec-target">
        {rec.mod} · {rec.file}
      </em>
    </button>
  )
}
