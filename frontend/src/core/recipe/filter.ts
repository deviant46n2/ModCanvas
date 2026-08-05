// Pure JEI-grammar filter for the Recipe Explorer. No UI, no IPC — 100%
// testable. Grammar (tokens AND-combined, whitespace-separated):
//   `@mod`    namespace or registry-mod match over output/ingredients
//   `#tag`    ingredient tag id match
//   `>id`     output id substring
//   `<id`     ingredient id substring (tags stripped of `#`)
//   bare text name/output/group/type/ingredient substring, plus tag-expanded
//   (a recipe matches when one of its tags contains an item matching the text)

import type { Recipe, RecipeIngredient } from './recipe-store';

export type OwnershipFilter = 'all' | 'mine' | 'pack' | 'jars';
export type StatusFilter = 'all' | 'enabled' | 'disabled';
export type RecipeTypeFilter = 'all' | Recipe['type'];

export interface FilterState {
  query: string;
  ownership: OwnershipFilter;
  status: StatusFilter;
  attention: boolean;
  changed: boolean;
  type: RecipeTypeFilter;
}

export interface FilterDeps {
  /** Store dispatch: true when the recipe is disabled in any mechanism. */
  isDisabled: (r: Recipe) => boolean;
  /** Expanded members of a tag id (from the local tag resolver), if known. */
  getTagMembers: (tagId: string) => string[];
  /** Item ids belonging to a mod (from the instance item registry). */
  modItemIds: (mod: string) => Set<string>;
  /** True when the recipe has validation errors or warnings. */
  hasIssues: (r: Recipe) => boolean;
}

/** True when the recipe belongs to the Mine provenance group. */
export function isMine(r: Recipe): boolean {
  return r.origin === 'authored';
}

/** True when the recipe belongs to the Pack provenance group. */
export function isPack(r: Recipe): boolean {
  return r.origin !== 'authored' && r.editable !== false;
}

/** True when the recipe belongs to the Jars (read-only) provenance group. */
export function isJars(r: Recipe): boolean {
  return r.editable === false;
}

/** Collect item ids and tag ids appearing anywhere in the recipe. */
export function recipeEntries(recipe: Recipe): { items: string[]; tags: string[] } {
  const items: string[] = [];
  const tags: string[] = [];
  if (recipe.output?.item) items.push(recipe.output.item);
  const pushIng = (ing: RecipeIngredient | undefined) => {
    if (!ing?.item) return;
    if (ing.tag) tags.push(ing.item.replace(/^#/, ''));
    else items.push(ing.item);
  };
  for (const ing of recipe.ingredients ?? []) pushIng(ing);
  for (const ing of Object.values(recipe.key ?? {})) pushIng(ing);
  return { items, tags };
}

function matchesMod(recipe: Recipe, mod: string, deps: FilterDeps): boolean {
  const { items, tags } = recipeEntries(recipe);
  const set = deps.modItemIds(mod);
  const prefix = `${mod}:`;
  return (
    items.some((i) => i.toLowerCase().startsWith(prefix)) ||
    tags.some((t) => t.toLowerCase().startsWith(prefix)) ||
    items.some((i) => set.has(i))
  );
}

function matchesToken(recipe: Recipe, token: string, deps: FilterDeps): boolean {
  if (token.startsWith('@')) {
    return matchesMod(recipe, token.slice(1).toLowerCase(), deps);
  }
  if (token.startsWith('#')) {
    const tag = token.slice(1).toLowerCase();
    return recipeEntries(recipe).tags.some((t) => t.toLowerCase().includes(tag));
  }
  if (token.startsWith('>')) {
    const out = token.slice(1).toLowerCase();
    return !!recipe.output?.item && recipe.output.item.toLowerCase().includes(out);
  }
  if (token.startsWith('<')) {
    const ing = token.slice(1).toLowerCase();
    const { items, tags } = recipeEntries(recipe);
    return (
      items.some((i) => i.toLowerCase().includes(ing)) ||
      tags.some((t) => t.toLowerCase().includes(ing))
    );
  }
  const text = token.toLowerCase();
  const { items, tags } = recipeEntries(recipe);
  const direct =
    recipe.name?.toLowerCase().includes(text) ||
    recipe.output?.item?.toLowerCase().includes(text) ||
    recipe.group?.toLowerCase().includes(text) ||
    recipe.type.toLowerCase().includes(text) ||
    items.some((i) => i.toLowerCase().includes(text)) ||
    tags.some((t) => t.toLowerCase().includes(text));
  if (direct) return true;
  // Tag-expanded: an item inside one of the recipe's tags matches the text.
  return tags.some((t) =>
    (deps.getTagMembers(t) ?? []).some((m) => m.toLowerCase().includes(text))
  );
}

/** Apply the full explorer filter set to a single recipe. */
export function matchesFilter(
  recipe: Recipe,
  state: FilterState,
  deps: FilterDeps
): boolean {
  if (state.ownership === 'mine' && !isMine(recipe)) return false;
  if (state.ownership === 'pack' && !isPack(recipe)) return false;
  if (state.ownership === 'jars' && !isJars(recipe)) return false;
  if (state.type !== 'all' && recipe.type !== state.type) return false;
  if (state.status === 'disabled' && !deps.isDisabled(recipe)) return false;
  if (state.status === 'enabled' && deps.isDisabled(recipe)) return false;
  if (state.attention && !deps.hasIssues(recipe)) return false;
  if (state.changed && !(isMine(recipe) && recipe.modified)) return false;
  const query = state.query.trim();
  if (!query) return true;
  return query.split(/\s+/).every((token) => matchesToken(recipe, token, deps));
}

/** Partition already-filtered recipes into the three provenance groups. */
export function groupByProvenance(recipes: Recipe[]): {
  mine: Recipe[];
  pack: Recipe[];
  jars: Recipe[];
} {
  const mine: Recipe[] = [];
  const pack: Recipe[] = [];
  const jars: Recipe[] = [];
  for (const r of recipes) {
    if (isMine(r)) mine.push(r);
    else if (isJars(r)) jars.push(r);
    else pack.push(r);
  }
  return { mine, pack, jars };
}
