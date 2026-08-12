// Pack Health analysis — the pure function that turns already-materialized
// state into a `PackHealthReport`. Per Project Bible §9.2 this must be a pure
// function of cached state: no I/O, no IPC, no on-demand rescans, sub-ms.
//
// Trust Rule (§4): the panel must never call a released pack "blocking" over a
// signal it cannot prove. Item-existence findings depend on the scanned item
// registry, which is inherently incomplete (KubeJS/data-driven/custom items are
// not in the jar scan; imported packs have no vanilla jar). So item checks are
// (a) always recommended and (b) suppressed entirely when the registry is too
// incomplete to be trustworthy — replaced by one clear diagnostic.

import type { Recipe } from '../recipe/recipe-store'
import type { ItemRegistryEntry, QuestGraphData } from '../../services/quest-types'
import type { Behavior } from '../behavior/behavior-store'
import { checkQuestStructure, checkQuestItemRefs, questItemCoverage } from './checks/quests'
import { computeTopology } from './checks/topology'
import { checkRecipes } from './checks/recipes'
import { checkBehaviors, behaviorItemCoverage } from './checks/behaviors'
import { checkPack, type PackCoverageMeta } from './checks/pack'
import type { HealthItem, HealthSection, HealthSectionKey, PackHealthReport } from './types'

export interface PackHealthInput {
  questGraph: QuestGraphData | null
  itemRegistry: ItemRegistryEntry[] | null
  recipes: Recipe[] | null
  behaviors: Behavior[] | null
  packMeta: PackCoverageMeta
  hasCoverImage: boolean
  packLoaded: boolean
}

export interface PackHealthStats {
  /** Number of items in the scanned registry. */
  indexedItems: number
  /** Fraction of quest item references the registry resolved, 0–1, or null when
   * there was nothing to check. */
  itemCoverage: number | null
}

/** Below this registry size (or reference-matching rate) the registry is too
 * incomplete to trust item-existence findings — a released pack would flood. */
export const MIN_TRUSTED_REGISTRY_ITEMS = 100
export const MIN_TRUSTED_REGISTRY_COVERAGE = 0.5
/** Coverage is only meaningful once this many references were checked — with a
 * handful of refs a single genuine miss would read as "registry broken". */
export const MIN_REFERENCE_SAMPLE = 20

const SECTION_META: Array<{ key: HealthSectionKey; label: string }> = [
  { key: 'quests', label: 'Quests' },
  { key: 'recipes', label: 'Recipes' },
  { key: 'behaviors', label: 'Behaviors' },
  { key: 'pack', label: 'Pack' },
]

export function sectionItems(report: PackHealthReport, key: HealthSectionKey): HealthItem[] {
  return report.sections.find((s) => s.key === key)?.items ?? []
}

function count(report: PackHealthReport, severity: HealthItem['severity']): number {
  return report.sections.reduce((acc, s) => acc + s.items.filter((i) => i.severity === severity).length, 0)
}

function registryDegraded(knownIds: Set<string>, coverage: { total: number; found: number }): boolean {
  if (knownIds.size < MIN_TRUSTED_REGISTRY_ITEMS) return true
  if (coverage.total < MIN_REFERENCE_SAMPLE) return false
  return coverage.found / coverage.total < MIN_TRUSTED_REGISTRY_COVERAGE
}

function degradedRegistryDiagnostic(knownIds: Set<string>, coverage: { total: number; found: number }): HealthItem {
  const pct = coverage.total > 0 ? Math.round((coverage.found / coverage.total) * 100) : 0
  return {
    id: 'pack.item-registry-degraded',
    severity: 'recommended',
    message: `Item registry is incomplete (${knownIds.size} items indexed, ${pct}% of referenced items matched) — item-existence checks were skipped.`,
    detail: 'Custom/KubeJS/data-driven items and imported packs without a vanilla jar are outside the jar scan. Attach the pack to its launcher instance for full coverage.',
    copyText: `Pack Health: item registry incomplete (${knownIds.size} items indexed, ${pct}% matched). Item-existence checks were skipped.`,
    target: { section: 'pack' },
  }
}

/** Topology measurements (P1-HEALTH-2) as recommended findings. Measurements,
 *  never opinions (Trust Rule): each names what was measured and the value.
 *  Empty graphs and graphs with no findings produce nothing. */
function topologyFindings(graph: QuestGraphData): HealthItem[] {
  const t = computeTopology(graph)
  const items: HealthItem[] = []
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]))
  const label = (id: string) => labelById.get(id) || id

  for (const id of t.bottlenecks) {
    items.push({
      id: `quest.topology.bottleneck.${id}`,
      severity: 'recommended',
      message: `"${label(id)}" gates more than half of the quest graph (${t.maxChainLength > 0 ? 'measurement' : 'topology'}).`,
      detail: 'Removing it disconnects a majority of quests — a structural pinch point.',
      copyText: `Pack topology: "${label(id)}" is a bottleneck (gates >50% of quests).`,
      target: { section: 'quests', nodeId: id },
    })
  }

  for (const id of t.walls) {
    items.push({
      id: `quest.topology.wall.${id}`,
      severity: 'recommended',
      message: `"${label(id)}" is a single path — no alternative route reaches what follows it.`,
      detail: 'If this quest is skipped or blocked, the quests after it are unreachable.',
      copyText: `Pack topology: "${label(id)}" is a wall (single path to downstream quests).`,
      target: { section: 'quests', nodeId: id },
    })
  }

  if (t.maxChainLength >= 6) {
    const chain = t.longestChains[0].map(label).join(' → ')
    items.push({
      id: 'quest.topology.longest-chain',
      severity: 'recommended',
      message: `Longest quest chain is ${t.maxChainLength} quests (pacing measurement).`,
      detail: chain,
      copyText: `Pack topology: longest chain ${t.maxChainLength} quests: ${chain}`,
      target: { section: 'quests' },
    })
  }

  return items
}

/** Compute the full pack-health report from materialized state. */
export function analyzePackHealth(input: PackHealthInput): PackHealthReport {  const knownIds = new Set((input.itemRegistry ?? []).map((i) => i.id))
  const quests: HealthItem[] = []
  const behaviors: HealthItem[] = []
  let registryNote: HealthItem | null = null
  let coverage: { total: number; found: number } = { total: 0, found: 0 }

  if (input.questGraph) {
    quests.push(...checkQuestStructure(input.questGraph))
    quests.push(...topologyFindings(input.questGraph))
    coverage = questItemCoverage(input.questGraph, knownIds)
    if (!registryDegraded(knownIds, coverage)) {
      quests.push(...checkQuestItemRefs(input.questGraph, knownIds))
    } else {
      registryNote = degradedRegistryDiagnostic(knownIds, coverage)
    }
  }

  // Behaviors share the quest guardrails: item-existence findings only fire
  // when the registry is trusted (same degraded-registry note, same
  // recommended severity — Trust Rule, see checks/behaviors.ts). When the
  // quest graph is absent but behaviors exist, coverage is still computed
  // from behavior references so the guard has signal.
  if (input.behaviors && input.behaviors.length > 0) {
    const behaviorCoverage = behaviorItemCoverage(input.behaviors, knownIds)
    if (coverage.total === 0) coverage = behaviorCoverage
    else {
      coverage.total += behaviorCoverage.total
      coverage.found += behaviorCoverage.found
    }
    if (!registryDegraded(knownIds, coverage)) {
      behaviors.push(...checkBehaviors(input.behaviors, knownIds))
    } else if (!registryNote) {
      registryNote = degradedRegistryDiagnostic(knownIds, coverage)
    }
  }

  const recipes = checkRecipes(input.recipes ?? [])
  const pack = checkPack({
    meta: input.packMeta,
    hasCoverImage: input.hasCoverImage,
    packLoaded: input.packLoaded,
    questGraph: input.questGraph,
  })
  if (registryNote) pack.push(registryNote)

  const sections: HealthSection[] = SECTION_META.map((meta) => ({
    ...meta,
    items: meta.key === 'quests' ? quests : meta.key === 'recipes' ? recipes : meta.key === 'behaviors' ? behaviors : pack,
  }))

  const report: PackHealthReport = {
    sections,
    blockingCount: 0,
    recommendedCount: 0,
    optionalCount: 0,
    go: true,
    stats: {
      indexedItems: knownIds.size,
      itemCoverage: coverage.total > 0 ? coverage.found / coverage.total : null,
    },
  }
  report.blockingCount = count(report, 'blocking')
  report.recommendedCount = count(report, 'recommended')
  report.optionalCount = count(report, 'optional')
  report.go = report.blockingCount === 0
  return report
}
