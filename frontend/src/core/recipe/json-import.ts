// Parse vanilla / KubeJS recipe JSON into the app's `Recipe` model.
// Pure and unit-testable; no I/O, no network. Handles both pre-1.20.5
// (`item`/`ingredients`) and 1.20.5+ (`id`/`ingredient`/`result` object) field
// spellings so pasted JSON from either era round-trips.

import type { Recipe, RecipeIngredient, RecipeOutput, RecipeType } from './recipe-store';

export interface ImportedRecipe {
  recipe: Recipe;
  warnings: string[];
}

export interface ImportResult {
  recipes: ImportedRecipe[];
  errors: { index: number; message: string }[];
}

const TYPE_MAP: Record<string, RecipeType> = {
  'minecraft:crafting_shaped': 'shaped',
  'minecraft:crafting_shapeless': 'shapeless',
  'minecraft:smelting': 'smelting',
  'minecraft:blasting': 'blasting',
  'minecraft:smoking': 'smoking',
  'minecraft:campfire_cooking': 'campfire',
  'minecraft:stonecutting': 'stonecutting',
  'minecraft:smithing_transform': 'smithing',
  'minecraft:smithing_trim': 'smithing',
};

function asObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function rawItemId(v: unknown): string {
  const o = asObject(v);
  if (o) {
    return (typeof o.id === 'string' ? o.id : typeof o.item === 'string' ? o.item : '') || '';
  }
  return typeof v === 'string' ? v : '';
}

function rawCount(v: unknown): number {
  const o = asObject(v);
  if (o) {
    const c = o.count;
    return typeof c === 'number' ? c : 1;
  }
  return 1;
}

/** Parse an ingredient: bare string, `{item}`, `{tag}`, `{id}` or alternatives
 * array. Returns the first resolvable entry (alternative lists are collapsed). */
function parseIngredient(v: unknown, warnings: string[], path: string): RecipeIngredient | null {
  const value = Array.isArray(v) ? v[0] : v;
  const o = asObject(value);
  const tagStr = o && typeof o.tag === 'string' ? o.tag : null;
  const id = tagStr || rawItemId(value);
  if (id.startsWith('#')) {
    return { item: id.slice(1), tag: true };
  }
  if (id) {
    if (tagStr) return { item: tagStr, tag: true };
    const count = rawCount(value);
    return { item: id, count: count > 1 ? count : undefined };
  }
  warnings.push(`${path}: skipped an empty ingredient.`);
  return null;
}

function parseResult(v: unknown, count?: number, warnings: string[] = []): RecipeOutput | null {
  const id = rawItemId(v);
  if (!id) {
    warnings.push('output: result has no item id.');
    return null;
  }
  return {
    item: id,
    count: count ?? rawCount(v),
  };
}

function parseShaped(o: Record<string, unknown>, warnings: string[]): Recipe | null {
  const pattern = Array.isArray(o.pattern) && o.pattern.every((r) => typeof r === 'string')
    ? (o.pattern as string[])
    : null;
  const key = asObject(o.key);
  if (!pattern || !key) {
    warnings.push('crafting_shaped: requires a pattern and key.');
    return null;
  }
  const result = parseResult(o.result, undefined, warnings);
  if (!result) return null;
  const keyMap: Record<string, RecipeIngredient> = {};
  for (const [k, v] of Object.entries(key)) {
    const ing = parseIngredient(v, warnings, `key.${k}`);
    if (ing) keyMap[k] = ing;
  }
  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'shaped',
    name: result.item,
    group: typeof o.group === 'string' ? o.group : undefined,
    pattern,
    key: keyMap,
    output: result,
  };
}

function parseShapeless(o: Record<string, unknown>, warnings: string[]): Recipe | null {
  const raw = o.ingredients ?? o.ingredient ?? o.input;
  const arr = Array.isArray(raw) ? raw : [raw];
  const ings = arr
    .map((v, i) => parseIngredient(v, warnings, `ingredients.${i}`))
    .filter((v): v is RecipeIngredient => !!v);
  if (ings.length === 0) {
    warnings.push('crafting_shapeless: needs at least one ingredient.');
    return null;
  }
  const result = parseResult(o.result, undefined, warnings);
  if (!result) return null;
  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'shapeless',
    name: result.item,
    group: typeof o.group === 'string' ? o.group : undefined,
    ingredients: ings,
    output: result,
  };
}

function parseCooking(o: Record<string, unknown>, type: RecipeType, warnings: string[]): Recipe | null {
  const ing = parseIngredient(o.ingredient ?? o.ingredients ?? o.input, warnings, 'ingredient');
  if (!ing) {
    warnings.push(`${type}: needs an input ingredient.`);
    return null;
  }
  const result = parseResult(o.result, undefined, warnings);
  if (!result) return null;
  const experience = typeof o.experience === 'number' ? o.experience : undefined;
  const cookingTime = typeof o.cookingtime === 'number' ? o.cookingtime : undefined;
  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    name: result.item,
    group: typeof o.group === 'string' ? o.group : undefined,
    ingredients: [ing],
    output: result,
    experience,
    cookingTime,
  };
}

function parseStonecutting(o: Record<string, unknown>, warnings: string[]): Recipe | null {
  const ing = parseIngredient(o.ingredient ?? o.input, warnings, 'ingredient');
  if (!ing) {
    warnings.push('stonecutting: expected an input ingredient.');
    return null;
  }
  const result = parseResult(o.result, undefined, warnings);
  if (!result) return null;
  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'stonecutting',
    name: result.item,
    group: typeof o.group === 'string' ? o.group : undefined,
    ingredients: [ing],
    output: result,
  };
}

function parseSmithing(o: Record<string, unknown>, warnings: string[]): Recipe | null {
  const base = parseIngredient(o.base, warnings, 'base');
  const addition = parseIngredient(o.addition, warnings, 'addition');
  if (!base || !addition) {
    warnings.push('smithing: requires a base and an addition.');
    return null;
  }
  const ings: RecipeIngredient[] = [base, addition];
  if (o.template) {
    warnings.push('smithing: template field is ignored because the current exporter only emits base + addition.');
  }
  const result = parseResult(o.result, undefined, warnings);
  if (!result) return null;
  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'smithing',
    name: result.item,
    group: typeof o.group === 'string' ? o.group : undefined,
    ingredients: ings,
    output: result,
  };
}

function idFor(o: Record<string, unknown>, warnings: string[]): void {
  if (typeof o.tags === 'string') warnings.push('legacy `tags` field is ignored.');
}

/** Parse a single recipe JSON object into the app model. */
export function parseRecipeJson(node: unknown): ImportedRecipe | null {
  const warnings: string[] = [];
  const o = asObject(node);
  if (!o) {
    return null;
  }
  idFor(o, warnings);
  const rawType = typeof o.type === 'string' ? o.type : '';
  const type = TYPE_MAP[rawType] || (rawType.includes('smithing') ? 'smithing' : null);
  if (!type) {
    warnings.push(`Unsupported recipe type "${rawType || '(missing)'}".`);
    return null;
  }
  let recipe: Recipe | null = null;
  switch (type) {
    case 'shaped': recipe = parseShaped(o, warnings); break;
    case 'shapeless': recipe = parseShapeless(o, warnings); break;
    case 'smelting':
    case 'blasting':
    case 'smoking':
    case 'campfire': recipe = parseCooking(o, type, warnings); break;
    case 'stonecutting': recipe = parseStonecutting(o, warnings); break;
    case 'smithing': recipe = parseSmithing(o, warnings); break;
    default: recipe = null;
  }
  if (!recipe) return null;
  return { recipe, warnings };
}

/**
 * Parse a chunk of pasted recipe JSON. Accepts either a single object or an
 * array of objects (vanilla recipe pack). Returns recipes plus per-entry
 * errors/warnings.
 */
export function importRecipeJson(text: string): ImportResult {
  const errors: { index: number; message: string }[] = [];
  const recipes: ImportedRecipe[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { recipes: [], errors: [{ index: 0, message: `Invalid JSON: ${(e as Error).message}` }] };
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  entries.forEach((entry, index) => {
    const result = parseRecipeJson(entry);
    if (result) {
      recipes.push(result);
    } else {
      errors.push({ index, message: 'Could not parse this recipe.' });
    }
  });
  return { recipes, errors };
}