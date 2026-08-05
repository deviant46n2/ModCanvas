import { commentOutRecipeCall, uncommentRecipeCall } from '../services/api'
import { useRecipeStore, type DisabledScriptEntry, type Recipe } from '../core/recipe/recipe-store'

/** The manifest entry backing a recipe's comment-out disable, if any. */
export function manifestEntryFor(
  recipe: Recipe,
  manifest: DisabledScriptEntry[]
): DisabledScriptEntry | null {
  if (!recipe.source || !recipe.sourceLines) return null
  return (
    manifest.find(
      (e) => e.file === recipe.source && e.startLine === recipe.sourceLines!.start
    ) ?? null
  )
}

/** Derive the Disabled-filter pseudo-recipes from the comment-out manifest: the
 *  ones whose call is gone from the pack list after a rescan stay visible,
 *  dimmed, with their snapshot name/output/type. */
export function manifestRecipesFrom(manifest: DisabledScriptEntry[]): Recipe[] {
  return manifest.map((e) => ({
    id: `disabled:${e.file}:${e.startLine}`,
    type: e.type,
    name: e.name,
    output: { item: e.outputItem, count: 1 },
    origin: 'kubejs' as const,
    editable: true,
    source: e.file,
    sourceLines: { start: e.startLine, end: e.endLine },
  }))
}

/** The IPC + dialog seams used by `toggleRecipeDisable` (injectable for tests). */
export interface DisableServices {
  commentOut: (
    projectId: string, file: string, start: number, end: number
  ) => Promise<string>
  uncomment: (
    projectId: string, file: string, start: number, end: number, fingerprint: string
  ) => Promise<void>
}

const defaultServices: DisableServices = {
  commentOut: commentOutRecipeCall,
  uncomment: uncommentRecipeCall,
}

/**
 * One-place disable toggle. The mechanism is chosen by the recipe's origin:
 *  - authored    → flip the `disabled` flag (no IPC)
 *  - vanilla/jar → toggle `disabledIds` (remove-by-id emission; no IPC)
 *  - kubejs/ct   → comment-out the call via IPC (with a confirm) + record the
 *    manifest entry; toggling again re-enables via integrity-checked IPC.
 * Pure (no React hooks) so it is directly unit-testable.
 */
export async function toggleRecipeDisable(
  projectId: string,
  recipe: Recipe,
  confirm: (message: string) => boolean,
  services: DisableServices = defaultServices
): Promise<void> {
  if (recipe.origin === 'authored') {
    useRecipeStore.getState().toggleDisableAuthored(recipe.id)
    return
  }
  if (recipe.origin === 'vanilla') {
    useRecipeStore.getState().toggleDisableById(recipe.id)
    return
  }
  // kubejs / crafttweaker
  const { disabledScripts } = useRecipeStore.getState()
  const entry = manifestEntryFor(recipe, disabledScripts)
  if (entry) {
    await services.uncomment(
      projectId, entry.file, entry.startLine, entry.endLine, entry.fingerprint
    )
    useRecipeStore.getState().removeDisabledScript(entry.file, entry.startLine)
    return
  }
  const span = recipe.sourceLines
  if (!recipe.source || !span) {
    throw new Error('Cannot disable: this recipe has no source span to comment out.')
  }
  const ok = confirm(
    `ModCanvas will comment out this recipe in ${recipe.source} (lines ${span.start}–${span.end}). Reversible.`
  )
  if (!ok) return
  const fingerprint = await services.commentOut(
    projectId, recipe.source, span.start, span.end
  )
  useRecipeStore.getState().addDisabledScript({
    file: recipe.source,
    startLine: span.start,
    endLine: span.end,
    name: recipe.name,
    outputItem: recipe.output.item,
    type: recipe.type,
    fingerprint,
  })
}

/** React wrapper exposing `toggleDisable` bound to the active project. */
export function useRecipeDisable(projectId: string) {
  const toggleDisable = (recipe: Recipe): Promise<void> =>
    toggleRecipeDisable(projectId, recipe, window.confirm.bind(window))
  return { toggleDisable }
}
