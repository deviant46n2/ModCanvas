// Conversion between a shaped recipe's `pattern` (strings of key letters) +
// `key` (letter -> ingredient) and a 2D visual grid of ingredients. Pure and
// unit-testable. The visual editor treats empty cells as null; non-empty cells
// hold their ingredient directly, so no key-letter bookkeeping is needed in the
// grid layer.

import type { RecipeIngredient } from './recipe-store';

export type Grid = (RecipeIngredient | null)[][];

const KEY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'.split('');

/**
 * Convert a shaped recipe's keyed pattern into a dense grid. Cells whose letter
 * is a space map to null; other letters look up their ingredient in `key`.
 * Unknown letters fall back to null (validation flags them).
 */
export function patternToGrid(pattern: string[], key: Record<string, RecipeIngredient>): Grid {
  return pattern.map((row) =>
    row.split('').map((ch) => (ch === ' ' ? null : key[ch] ?? null)),
  );
}

/**
 * Convert a visual grid back into a shaped pattern + key. Reuses existing
 * letters from `prevKey` when the ingredient matches a previously bound key to
 * keep patterns stable across edits; otherwise allocates a fresh key letter.
 * Cells are de-duplicated by ingredient so identical inputs share one letter.
 */
export function gridToPattern(grid: Grid, prevKey: Record<string, RecipeIngredient>): { pattern: string[]; key: Record<string, RecipeIngredient> } {
  const key: Record<string, RecipeIngredient> = {};
  const letterByIngredient = new Map<string, string>();
  const nextLetter = (() => {
    let i = 0;
    return () => {
      let ch = KEY_LETTERS[i % KEY_LETTERS.length];
      while (key[ch] !== undefined) {
        i++;
        ch = KEY_LETTERS[i % KEY_LETTERS.length];
      }
      i++;
      return ch;
    };
  })();

  const signature = (ing: RecipeIngredient): string => {
    return `${ing.tag ? '#' : ''}${ing.item}${ing.count ? `\u0001${ing.count}` : ''}`;
  };

  const resolveLetter = (ing: RecipeIngredient): string => {
    const sig = signature(ing);
    const existing = letterByIngredient.get(sig);
    if (existing) return existing;
    // Reuse a previous key whose signature matches, preserving stable letters.
    for (const [ch, prev] of Object.entries(prevKey)) {
      if (signature(prev) === sig && key[ch] === undefined) {
        key[ch] = ing;
        letterByIngredient.set(sig, ch);
        return ch;
      }
    }
    const ch = nextLetter();
    key[ch] = ing;
    letterByIngredient.set(sig, ch);
    return ch;
  };

  const pattern = grid.map((row) =>
    row.map((cell) => (cell ? resolveLetter(cell) : ' ')).join(''),
  );
  return { pattern, key };
}

/**
 * Lay a shapeless ingredient list out 3-wide into a 3×3 grid (empty tail
 * cells become null). Row-major, so `[a, b, c, d]` fills the first row then
 * starts the second.
 */
export function ingredientsToGrid(ingredients: RecipeIngredient[]): Grid {
  const grid: Grid = [[], [], []];
  for (let i = 0; i < ingredients.length; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const target = grid[row];
    while (target.length < col) target.push(null);
    target[col] = ingredients[i];
  }
  for (const row of grid) {
    while (row.length < 3) row.push(null);
  }
  return grid;
}

/** Collapse a 3×3 grid back into a shapeless ingredient list (row-major,
 *  dropping null cells). Preserves each cell's item/count/tag as-is. */
export function gridToIngredients(grid: Grid): RecipeIngredient[] {
  return grid.flatMap((row) => row.filter((c): c is RecipeIngredient => !!c));
}