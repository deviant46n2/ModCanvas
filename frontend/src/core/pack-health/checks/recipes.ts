// Recipe-health checks. Reuses the real recipe validator so the health panel
// can never contradict what the editor's inline validation shows.
//
// Trust scope: only `authored` recipes (the ones this editor writes) produce
// blocking findings. Recipes discovered from the pack (vanilla / kubejs /
// crafttweaker) are not our authoring surface, and their structures can be
// legitimately unusual, so v1 leaves them untouched rather than risk a false
// "blocking" verdict.

import type { Recipe } from '../../recipe/recipe-store'
import { validateRecipe, hasErrors } from '../../recipe/validation'
import type { HealthItem } from '../types'

/** Run all recipe-health checks over the authored recipe set. */
export function checkRecipes(recipes: Recipe[]): HealthItem[] {
  const items: HealthItem[] = []
  for (const recipe of recipes) {
    if (recipe.origin === 'vanilla' || recipe.origin === 'kubejs' || recipe.origin === 'crafttweaker') {
      continue
    }
    const issues = validateRecipe(recipe)
    if (issues.length === 0) continue
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')
    const label = recipe.name || recipe.output?.item || recipe.id

    if (errors.length > 0 && hasErrors(issues)) {
      items.push({
        id: `recipes.error.${recipe.id}`,
        severity: 'blocking',
        message: `Recipe "${label}" has ${errors.length} error${errors.length === 1 ? '' : 's'}: ${errors[0].message}`,
        detail: errors.map((e) => `${e.path ?? 'recipe'}: ${e.message}`).join('\n'),
        copyText: `Recipe "${label}" (${recipe.id}) errors:\n${errors
          .map((e) => `${e.path ?? 'recipe'}: ${e.message}`)
          .join('\n')}`,
        target: { section: 'recipes' },
      })
    } else if (warnings.length > 0) {
      items.push({
        id: `recipes.warning.${recipe.id}`,
        severity: 'recommended',
        message: `Recipe "${label}" has ${warnings.length} warning${warnings.length === 1 ? '' : 's'}: ${warnings[0].message}`,
        detail: warnings.map((w) => `${w.path ?? 'recipe'}: ${w.message}`).join('\n'),
        copyText: `Recipe "${label}" (${recipe.id}) warnings:\n${warnings
          .map((w) => `${w.path ?? 'recipe'}: ${w.message}`)
          .join('\n')}`,
        target: { section: 'recipes' },
      })
    }
  }
  return items
}
