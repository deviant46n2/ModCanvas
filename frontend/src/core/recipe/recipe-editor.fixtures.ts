// Shared fixtures for the recipe-editor test suite (split from the old single
// recipe-editor.test.ts). `ing` builds an ingredient, `baseRecipe` a valid
// shaped recipe that individual tests can override.

import type { Recipe, RecipeIngredient } from './recipe-store'

export const ing = (item: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  item,
  tag: false,
  ...extra,
})

export function baseRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    type: 'shaped',
    name: 'Test',
    pattern: ['A A', ' A ', 'A A'],
    key: { A: ing('minecraft:diamond') },
    ingredients: [],
    output: { item: 'minecraft:diamond_block', count: 1 },
    ...over,
  }
}
