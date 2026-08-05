// Pure bulk "replace ingredient" logic for the editable (Mine) recipe scope.
// No UI, no IPC — 100% testable. The emitter already handles the mutated
// values, so this needs no new Rust backend.

import type { Recipe, RecipeIngredient } from './recipe-store';

/** An ingredient reference: an item id, or a tag id (`tag: true`). */
export interface IngredientRef {
  item: string;
  tag: boolean;
}

/** Canonical map key for a ref (`id` or `#tagId`). */
export function refKey(ref: IngredientRef): string {
  return ref.tag ? `#${ref.item.replace(/^#/, '')}` : ref.item;
}

/** True when `ing` matches `ref` (tag-ness + id, `#`-stripped). */
export function refMatches(ref: IngredientRef, ing: RecipeIngredient | undefined): boolean {
  if (!ing?.item) return false;
  return (
    (ing.tag ?? false) === ref.tag &&
    ing.item.replace(/^#/, '') === ref.item.replace(/^#/, '')
  );
}

/** True when the recipe uses `ref` anywhere (ingredients or shaped key map). */
export function recipeHasIngredient(recipe: Recipe, ref: IngredientRef): boolean {
  if ((recipe.ingredients ?? []).some((ing) => refMatches(ref, ing))) return true;
  return Object.values(recipe.key ?? {}).some((ing) => refMatches(ref, ing));
}

/** Ids of the selected recipes that actually use `from` (the change preview). */
export function affectedRecipeIds(
  recipes: Recipe[],
  selectedIds: string[],
  from: IngredientRef,
): string[] {
  const selected = new Set(selectedIds);
  return recipes
    .filter((r) => selected.has(r.id) && recipeHasIngredient(r, from))
    .map((r) => r.id);
}

/** Replace every occurrence of `from` with `to` in a recipe's ingredients and
 *  shaped key map. Only the fields that exist on the recipe are touched. */
export function replaceIngredient(
  recipe: Recipe,
  from: IngredientRef,
  to: IngredientRef,
): Partial<Recipe> {
  const replaceOne = (ing: RecipeIngredient): RecipeIngredient =>
    refMatches(from, ing)
      ? { ...ing, item: to.item.replace(/^#/, ''), tag: to.tag }
      : ing;

  const updates: Partial<Recipe> = {};
  if (recipe.ingredients) {
    updates.ingredients = recipe.ingredients.map(replaceOne);
  }
  if (recipe.key) {
    const next: Record<string, RecipeIngredient> = {};
    for (const [k, ing] of Object.entries(recipe.key)) next[k] = replaceOne(ing);
    updates.key = next;
  }
  return updates;
}
