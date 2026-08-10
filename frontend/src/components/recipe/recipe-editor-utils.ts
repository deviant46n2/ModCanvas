import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store'
import type { ImportedRecipe } from '../../core/recipe/json-import'
import { patternToGrid, ingredientsToGrid, gridToPattern, gridToIngredients, type Grid } from '../../core/recipe/grid'
import { replaceIngredient, type IngredientRef } from '../../core/recipe/bulk-replace'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import { textureDisplayUrl, isTexturePending, requestMaterialize, isUsableTextureValue } from '../../services/texture-loader'
import { scanPackRecipes, scanInstanceItems, listItemTags } from '../../services/api'
import { withDiscoveredMeta } from '../../hooks/app-state-utils'

export function readScriptPreviewPref(): boolean {
  return localStorage.getItem('modcanvas:recipe-script-preview') === '1'
}

export function writeScriptPreviewPref(next: boolean): void {
  localStorage.setItem('modcanvas:recipe-script-preview', next ? '1' : '0')
}

export function buildRegistryUrlMap(itemRegistry: ItemRegistryEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of itemRegistry) {
    // The registry field may hold a compact `jar:` descriptor (enumeration-only
    // scans) — only displayable URLs belong in this map; descriptors resolve
    // through the texture index/materializer instead.
    const url = item.texture_data_url
    if (url && isUsableTextureValue(url)) map.set(item.id, url)
  }
  return map
}

export function makeTextureUrlGetter(
  textureIndex: Record<string, string>,
  projectPath: string,
): (itemId: string) => string | null {
  return (itemId: string): string | null => {
    if (!itemId) return null
    const key = itemId.replace(/^#/, '')
    const url = textureDisplayUrl(textureIndex, key)
    if (url) return url
    // Lazy-materialize on demand; show a placeholder until it resolves.
    if (isTexturePending(textureIndex, key)) {
      requestMaterialize([key], projectPath)
    }
    return null
  }
}

export function createNewRecipe(): Omit<Recipe, 'id'> {
  return {
    type: 'shaped',
    name: 'New Recipe',
    group: '',
    pattern: ['   ', '   ', '   '],
    key: {},
    ingredients: [],
    output: { item: '', count: 1 },
  }
}

export function recipeFromImported(entry: ImportedRecipe): Omit<Recipe, 'id'> {
  const { recipe } = entry
  return {
    type: recipe.type,
    name: recipe.name,
    group: recipe.group,
    pattern: recipe.pattern,
    key: recipe.key,
    ingredients: recipe.ingredients,
    output: recipe.output,
    experience: recipe.experience,
    cookingTime: recipe.cookingTime,
  }
}

export function buildGridCells(selectedRecipe: Recipe | null): Grid {
  if (!selectedRecipe) return []
  if (selectedRecipe.type === 'shaped') {
    return patternToGrid(selectedRecipe.pattern ?? [], selectedRecipe.key ?? {})
  }
  if (selectedRecipe.type === 'shapeless') {
    return ingredientsToGrid(selectedRecipe.ingredients ?? [])
  }
  return []
}

export function applyCellEdit(grid: Grid, row: number, col: number, ing: RecipeIngredient | null): Grid {
  const next = grid.map(r => [...r])
  if (row < next.length && col < next[row].length) next[row][col] = ing
  return next
}

export function applyCellCount(grid: Grid, row: number, col: number, count: number): Grid {
  const next = grid.map(r => [...r])
  const cell = next[row]?.[col]
  if (cell) next[row][col] = { ...cell, count }
  return next
}

export function applyGridToRecipe(recipe: Recipe, grid: Grid): Partial<Recipe> | null {
  if (recipe.type === 'shaped') {
    const { pattern, key } = gridToPattern(grid, recipe.key ?? {})
    return { pattern, key }
  }
  if (recipe.type === 'shapeless') {
    return { ingredients: gridToIngredients(grid) }
  }
  return null
}

export function applyBulkReplace(
  recipes: Recipe[],
  affectedIds: string[],
  from: IngredientRef,
  to: IngredientRef,
  updateRecipe: (id: string, updates: Partial<Recipe>) => void,
): void {
  for (const id of affectedIds) {
    const recipe = recipes.find((r) => r.id === id)
    if (!recipe || recipe.origin !== 'authored') continue
    updateRecipe(id, replaceIngredient(recipe, from, to))
  }
}

export function createToggleDisableHandler(
  toggleDisable: (recipe: Recipe) => Promise<void>,
): (recipe: Recipe) => Promise<void> {
  return async (recipe: Recipe) => {
    try {
      await toggleDisable(recipe)
    } catch (e) {
      window.alert(String(e))
    }
  }
}

export function createRecipesUsingHandler(
  setExplorerQuery: (q: string) => void,
): (itemOrTagId: string) => void {
  return (itemOrTagId: string) => {
    setExplorerQuery(itemOrTagId.startsWith('#') ? itemOrTagId : `>${itemOrTagId}`)
  }
}

export async function reloadPackRecipes(
  projectPath: string,
  loadRecipesFromPack: (recipes: Recipe[]) => number,
): Promise<string> {
  const discovered = await scanPackRecipes(projectPath)
  const added = loadRecipesFromPack(withDiscoveredMeta(discovered))
  return added > 0 ? `Added ${added} recipes` : 'Recipes are up to date'
}

export async function scanItemRegistry(
  projectPath: string,
  kubejsNamespace: string,
): Promise<{ registry: ItemRegistryEntry[]; tags: ItemTagInfo[] }> {
  const [registry, tags] = await Promise.all([
    scanInstanceItems(projectPath, kubejsNamespace),
    listItemTags(projectPath),
  ])
  return { registry, tags }
}
