// Real-time recipe validation. Pure, UI-free, unit-testable. Returns a list of
// issues keyed by severity so the UI can badge fields. Powered only by the
// recipe model — no I/O, no network.

import type { Recipe, RecipeIngredient } from './recipe-store';

export type IssueSeverity = 'error' | 'warning';

export interface RecipeIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Human-friendly dot-path pointing at the offending field, e.g. `pattern` or `key.A`. */
  path?: string;
}

function isNamespace(s: string): boolean {
  return /^[a-z0-9_-]+(:[a-z0-9_./-]+)?$/.test(s);
}

function isValidItemId(id: string): boolean {
  const trimmed = id?.trim() ?? '';
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return false; // tags handled separately
  return isNamespace(trimmed);
}

function isValidTag(tag: string): boolean {
  const trimmed = tag.trim();
  if (!trimmed) return false;
  const body = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return isNamespace(body);
}

function ingredientIssues(ing: RecipeIngredient | undefined, path: string): RecipeIssue[] {
  if (!ing) return [];
  const issues: RecipeIssue[] = [];
  const raw = (ing.item ?? '').trim();
  if (!raw) {
    issues.push({ severity: 'error', code: 'empty_ingredient', path, message: 'Ingredient has no item or tag.' });
    return issues;
  }
  if (ing.tag) {
    if (!isValidTag(raw)) {
      issues.push({ severity: 'error', code: 'bad_tag', path, message: `"${raw}" does not look like a valid tag.` });
    }
  } else if (!isValidItemId(raw)) {
    issues.push({ severity: 'error', code: 'bad_item', path, message: `"${raw}" is not a valid item id.` });
  }
  // `count` is optional: undefined, null (Rust `Option::None`), and an
  // in-range number are all valid. Only an explicit out-of-range number warns.
  if (ing.count != null && (!Number.isFinite(ing.count) || ing.count < 1 || ing.count > 64)) {
    issues.push({ severity: 'warning', code: 'bad_count', path, message: 'Count must be between 1 and 64.' });
  }
  return issues;
}

function shapedIssues(recipe: Recipe): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const pattern = recipe.pattern ?? [];
  const key = recipe.key ?? {};

  if (pattern.length === 0 || pattern.every((r) => r.trim().length === 0)) {
    issues.push({ severity: 'error', code: 'empty_pattern', path: 'pattern', message: 'Shaped recipe has no pattern rows.' });
    return issues;
  }

  const rowLen = pattern[0].length;
  if (pattern.some((r) => r.length !== rowLen)) {
    issues.push({ severity: 'error', code: 'ragged_pattern', path: 'pattern', message: 'All pattern rows must be the same length.' });
  }

  const usedKeys = new Set<string>();
  for (const row of pattern) {
    for (const ch of row) {
      if (ch === ' ') continue;
      usedKeys.add(ch);
      if (!key[ch]) {
        issues.push({ severity: 'error', code: 'unbound_key', path: `pattern`, message: `Pattern uses key "${ch}" but it has no ingredient binding.` });
      }
    }
  }
  for (const [k, ing] of Object.entries(key)) {
    if (!usedKeys.has(k)) {
      issues.push({ severity: 'warning', code: 'unused_key', path: `key.${k}`, message: `Key "${k}" is defined but never used in the pattern.` });
    } else {
      issues.push(...ingredientIssues(ing, `key.${k}`));
    }
  }
  return issues;
}

/** Validate a recipe. Returns a list of issues (errors + warnings). */
export function validateRecipe(recipe: Recipe | null | undefined): RecipeIssue[] {
  if (!recipe) return [];
  const issues: RecipeIssue[] = [];

  const out = recipe.output;
  if (!out || !out.item?.trim()) {
    issues.push({ severity: 'error', code: 'empty_output', path: 'output.item', message: 'Output must have an item id.' });
  } else if (!isValidItemId(out.item.trim())) {
    issues.push({ severity: 'error', code: 'bad_output', path: 'output.item', message: `"${out.item}" is not a valid item id.` });
  }
  if (out && (out.count < 1 || out.count > 64)) {
    issues.push({ severity: 'warning', code: 'bad_out_count', path: 'output.count', message: 'Output count must be 1-64.' });
  }

  switch (recipe.type) {
    case 'shaped':
      issues.push(...shapedIssues(recipe));
      break;
    case 'shapeless': {
      const ings = recipe.ingredients ?? [];
      if (ings.length === 0) {
        issues.push({ severity: 'error', code: 'empty_shapeless', path: 'ingredients', message: 'Shapeless recipe needs at least one ingredient.' });
      }
      ings.forEach((ing, i) => issues.push(...ingredientIssues(ing, `ingredients.${i}`)));
      break;
    }
    case 'smithing': {
      const ings = recipe.ingredients ?? [];
      const required = 2;
      for (let i = 0; i < Math.min(required, ings.length); i++) {
        issues.push(...ingredientIssues(ings[i], `ingredients.${i}`));
      }
      if (ings.length < required) {
        issues.push({ severity: 'error', code: 'missing_ingredient', path: 'ingredients', message: 'Smithing needs a base and an addition.' });
      }
      break;
    }
    case 'stonecutting':
    case 'smelting':
    case 'blasting':
    case 'smoking':
    case 'campfire': {
      const ings = recipe.ingredients ?? [];
      const required = 1;
      for (let i = 0; i < Math.min(required, ings.length); i++) {
        issues.push(...ingredientIssues(ings[i], `ingredients.${i}`));
      }
      if (ings.length < required) {
        issues.push({ severity: 'error', code: 'missing_ingredient', path: 'ingredients', message: 'This recipe needs an input ingredient.' });
      }
      if (recipe.experience !== undefined && recipe.experience < 0) {
        issues.push({ severity: 'warning', code: 'bad_xp', path: 'experience', message: 'Experience cannot be negative.' });
      }
      if (recipe.cookingTime !== undefined && recipe.cookingTime < 1) {
        issues.push({ severity: 'warning', code: 'bad_time', path: 'cookingTime', message: 'Cooking time must be a positive number of ticks.' });
      }
      break;
    }
    default:
      break;
  }

  return issues;
}

/** True when any issue is an error (blocking save). */
export function hasErrors(issues: RecipeIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** The exact set of recipes the save and preview pipelines emit: must have an
 *  output item and no blocking errors. Single source of truth so the preview
 *  matches the on-disk script byte-for-byte. */
export function selectSaveableRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter((r) => r.output.item && !hasErrors(validateRecipe(r)));
}

/** Group issues by their `path` for field-level badges. */
export function issuesByPath(issues: RecipeIssue[]): Record<string, RecipeIssue[]> {
  const map: Record<string, RecipeIssue[]> = {};
  for (const issue of issues) {
    const p = issue.path ?? 'recipe';
    (map[p] ??= []).push(issue);
  }
  return map;
}