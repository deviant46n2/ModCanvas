import type { Recipe } from '../../core/recipe/recipe-store'
import { validateRecipe } from '../../core/recipe/validation'
import { getTagItems } from '../../services/smart-filter-tags'
import type { ItemRegistryEntry } from '../../services/quest-types'

export type RowStatus = 'error' | 'warning' | 'ok' | 'none'

export interface IssueStatus {
  hasError: boolean
  hasWarning: boolean
}

export type IssueStatusMap = Map<string, IssueStatus>

export function buildIssuesMap(recipes: Recipe[]): IssueStatusMap {
  const map = new Map<string, IssueStatus>()
  for (const r of recipes) {
    if (r.origin !== 'authored') continue
    const issues = validateRecipe(r)
    map.set(r.id, {
      hasError: issues.some((i) => i.severity === 'error'),
      hasWarning: issues.some((i) => i.severity === 'warning'),
    })
  }
  return map
}

export function buildModItemLookup(itemRegistry: ItemRegistryEntry[]): (mod: string) => Set<string> {
  const map = new Map<string, Set<string>>()
  for (const item of itemRegistry) {
    let set = map.get(item.mod_id)
    if (!set) { set = new Set(); map.set(item.mod_id, set) }
    set.add(item.id)
  }
  return (mod: string) => map.get(mod) ?? new Set<string>()
}

export function getTagMembers(tag: string): string[] {
  return getTagItems(tag) ?? []
}

export function mergeManifestRecipes(recipes: Recipe[], manifestRecipes: Recipe[]): Recipe[] {
  const seen = new Set<string>()
  for (const r of recipes) {
    if (r.source && r.sourceLines) seen.add(`${r.source}:${r.sourceLines.start}`)
  }
  const extras = manifestRecipes.filter(
    (m) => m.source && m.sourceLines && !seen.has(`${m.source}:${m.sourceLines.start}`)
  )
  return [...recipes, ...extras]
}

export function rowStatusOf(r: Recipe, issuesMap: IssueStatusMap): RowStatus {
  if (r.editable === false || r.origin !== 'authored') return 'none'
  const i = issuesMap.get(r.id)
  if (!i) return 'ok'
  if (i.hasError) return 'error'
  if (i.hasWarning) return 'warning'
  return 'ok'
}

export const EXPLORER_COLUMN_WIDTH = 260
export const EXPLORER_ROW_HEIGHT = 52
export const EXPLORER_MINE_MAX_H = 260
export const EXPLORER_PACK_MAX_H = 400
export const EXPLORER_JARS_MAX_H = 320
export const EXPLORER_SECTION_TITLE_H = 26
export const EXPLORER_SECTION_GAP = 8

export interface ExplorerGridLayout {
  mineH: number
  packH: number
  jarsH: number
  mineGrid: boolean
  packGrid: boolean
}

export function computeGridLayout(args: {
  panelW: number
  groupsH: number
  mineCount: number
  packCount: number
  jarsCount: number
  showMine: boolean
  showPack: boolean
  showJars: boolean
  jarsCollapsed: boolean
}): ExplorerGridLayout {
  const columns = Math.max(1, Math.floor(args.panelW / EXPLORER_COLUMN_WIDTH))
  const gridH = (count: number, cap: number) =>
    Math.min(Math.ceil(count / columns) * EXPLORER_ROW_HEIGHT, cap)

  const mineGrid = args.showMine && args.mineCount > 0
  const packGrid = args.showPack && args.packCount > 0
  const jarsExpandedGrid = args.showJars && args.jarsCount > 0 && !args.jarsCollapsed

  let mineH = mineGrid ? gridH(args.mineCount, EXPLORER_MINE_MAX_H) : 0
  let packH = packGrid ? gridH(args.packCount, EXPLORER_PACK_MAX_H) : 0
  let jarsH = jarsExpandedGrid ? gridH(args.jarsCount, EXPLORER_JARS_MAX_H) : 0

  const titleRows =
    (mineGrid ? 1 : 0) + (packGrid ? 1 : 0) + (args.showJars && args.jarsCount > 0 ? 1 : 0)
  const fixedH =
    titleRows * EXPLORER_SECTION_TITLE_H + Math.max(0, titleRows - 1) * EXPLORER_SECTION_GAP
  const leftover = Math.max(0, args.groupsH - fixedH - (mineH + packH + jarsH))
  if (jarsExpandedGrid) jarsH += leftover
  else if (packGrid) packH += leftover
  else if (mineGrid) mineH += leftover

  return { mineH, packH, jarsH, mineGrid, packGrid }
}
