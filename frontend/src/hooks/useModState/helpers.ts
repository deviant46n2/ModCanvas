// Pure helpers for `useModState`: mod list filtering and metadata lookups.
// No state, no I/O — unit-testable in isolation.

import type { ModDependency } from './types'

export function filterMods(projectMods: any[], modFilter: string): any[] {
  return projectMods.filter(mod =>
    !modFilter ||
    mod.name.toLowerCase().includes(modFilter.toLowerCase()) ||
    mod.author.toLowerCase().includes(modFilter.toLowerCase())
  )
}

export function findMissingDependencies(
  modMetadata: Map<string, any>,
  projectMods: any[],
  modId: string,
): ModDependency[] {
  const meta = modMetadata.get(modId)
  if (!meta) return []
  return meta.dependencies.filter((dep: ModDependency) => {
    if (dep.dependency_type !== 'required') return false
    return !projectMods.some(m => m.mod_id === dep.mod_id)
  })
}

export function resolveModName(
  projectMods: any[],
  modMetadata: Map<string, any>,
  depNameMap: Map<string, string>,
  modId: string,
): string {
  const mod = projectMods.find(m => m.mod_id === modId)
  if (mod) return mod.name
  const meta = modMetadata.get(modId)
  if (meta) return meta.name
  const depName = depNameMap.get(modId)
  if (depName) return depName
  return modId
}
