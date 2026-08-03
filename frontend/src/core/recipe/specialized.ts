// Pure mapping between a non-crafting recipe's declared inputs and a fixed,
// type-specific set of named slots. Keeps the specialized editors (furnace,
// stonecutting, smithing) free of shape logic and unit-testable.

import type { Recipe, RecipeIngredient, RecipeType } from './recipe-store';

export const SPECIALIZED_TYPES: RecipeType[] = [
  'smithing',
  'stonecutting',
  'smelting',
  'blasting',
  'smoking',
  'campfire',
];

/** Human labels used by the editors, keyed by recipe type. */
export const SPECIALIZED_LABELS: Record<RecipeType, string> = {
  shaped: 'Shaped',
  shapeless: 'Shapeless',
  smithing: 'Smithing',
  stonecutting: 'Stonecutting',
  smelting: 'Smelting',
  blasting: 'Blasting',
  smoking: 'Smoking',
  campfire: 'Campfire',
};

/** Related recipe types that emit a `cookingTime` (all but stonecutting). */
export function hasCookingTime(type: RecipeType): boolean {
  return type === 'smelting' || type === 'blasting' || type === 'smoking' || type === 'campfire';
}

/** Whether the type emits an `experience` field. */
export function hasExperience(type: RecipeType): boolean {
  return type === 'smelting' || type === 'blasting' || type === 'smoking' || type === 'campfire';
}

/**
 * Map a recipe's input entries to named slots for a given type.
 *
 * - smithing:  `template`, `base`, `addition`
 * - stonecutting / furnace family: `input`
 * - everything else: `{}` (crafting handled elsewhere)
 */
export function slotsForType(type: RecipeType): string[] {
  switch (type) {
    case 'smithing':
      return ['base', 'addition'];
    case 'stonecutting':
    case 'smelting':
    case 'blasting':
    case 'smoking':
    case 'campfire':
      return ['input'];
    default:
      return [];
  }
}

/** Index of a slot name within the recipe's `ingredients[]` array (0-based). */
export function slotIndex(type: RecipeType, slot: string): number {
  const slots = slotsForType(type);
  const idx = slots.indexOf(slot);
  return idx < 0 ? 0 : idx;
}

/** Read the ingredient currently bound to a named slot, or undefined. */
export function readSlot(recipe: Recipe, slot: string): RecipeIngredient | undefined {
  if (recipe.type === 'smithing') {
    return slot === 'base' ? recipe.ingredients?.[0] : recipe.ingredients?.[1];
  }
  if (slot === 'input') return recipe.ingredients?.[0];
  return undefined;
}

/**
 * Write an ingredient to a named slot, returning a new `ingredients` array
 * (pre-sized so numeric slot indexes stay stable). Empty entries are dropped;
 * unpredictable trailing empties are trimmed to keep exports clean.
 */
export function writeSlot(
  recipe: Recipe,
  slot: string,
  ingredient: RecipeIngredient | null,
): RecipeIngredient[] {
  if (recipe.type === 'smithing') {
    const target = slot === 'base' ? 0 : 1;
    const next: (RecipeIngredient | null)[] = [...(recipe.ingredients ?? [])];
    while (next.length < 2) next.push(null);
    next[target] = ingredient ?? null;
    return next.reduce<RecipeIngredient[]>((acc, c) => {
      if (c) acc.push(c);
      return acc;
    }, []);
  }
return ingredient ? [ingredient] : [];
}