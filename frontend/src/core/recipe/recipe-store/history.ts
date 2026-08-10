// Undo/redo snapshot stack for the recipe store. Module-level because the store
// is a module singleton; `clearHistory` resets it on bulk reloads (`setRecipes`).

import type { Recipe } from './types'

export interface RecipeSnapshot {
  recipes: Recipe[]
  selectedRecipeId: string | null
}

const MAX_UNDO = 50
let undoStack: RecipeSnapshot[] = []
let redoStack: RecipeSnapshot[] = []

export function takeSnapshot(state: { recipes: Recipe[]; selectedRecipeId: string | null }): RecipeSnapshot {
  return {
    recipes: JSON.parse(JSON.stringify(state.recipes)),
    selectedRecipeId: state.selectedRecipeId,
  };
}

/** Record a pre-mutation snapshot: push + trim the undo stack, clear redo. */
export function recordMutation(prev: RecipeSnapshot): void {
  undoStack.push(prev)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack = []
}

export function clearHistory(): void {
  undoStack = []
  redoStack = []
}

export function popUndo(): RecipeSnapshot | undefined {
  return undoStack.pop()
}

/** Plain push onto the undo stack (used by redo, which does not trim). */
export function pushUndo(snapshot: RecipeSnapshot): void {
  undoStack.push(snapshot)
}

export function pushRedo(snapshot: RecipeSnapshot): void {
  redoStack.push(snapshot)
}

export function popRedo(): RecipeSnapshot | undefined {
  return redoStack.pop()
}

export function undoDepth(): number {
  return undoStack.length
}

export function redoDepth(): number {
  return redoStack.length
}
