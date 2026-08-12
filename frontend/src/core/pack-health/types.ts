// Pack Health report model. Pure data types shared by the analysis (`analyze.ts`),
// the state store, and the UI tab. No I/O, no UI imports.

export type HealthSeverity = 'blocking' | 'recommended' | 'optional'

/** A single finding. `copyText` is what the UI's Copy button copies (Trust Rule:
 * every error display has a Copy button). */
export interface HealthItem {
  /** Stable id used as a React key and for dedupe, e.g. `quest.missing-item.<questId>.<field>.<item>`. */
  id: string
  severity: HealthSeverity
  message: string
  detail?: string
  copyText: string
  /** Optional target for future "jump to" affordances. */
  target?: {
    section: 'quests' | 'recipes' | 'behaviors' | 'pack'
    nodeId?: string
  }
}

export type HealthSectionKey = 'quests' | 'recipes' | 'behaviors' | 'pack'

export interface HealthSection {
  key: HealthSectionKey
  label: string
  items: HealthItem[]
}

export interface PackHealthStats {
  /** Number of items in the scanned registry. */
  indexedItems: number
  /** Fraction of quest item references the registry resolved, 0–1, or null when
   * there was nothing to check. */
  itemCoverage: number | null
}

export interface PackHealthReport {
  sections: HealthSection[]
  blockingCount: number
  recommendedCount: number
  optionalCount: number
  /**
   * GO = ready to **test**, never "ready to ship" (Project Bible §4.3).
   * True when there are zero blocking findings.
   */
  go: boolean
  /** Diagnostics about the underlying materialized state (e.g. registry size). */
  stats: PackHealthStats
}
