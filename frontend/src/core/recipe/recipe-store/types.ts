// Recipe store type definitions. Split out of `recipe-store.ts` so the store
// module stays under the 300-line budget; pure data types, no logic.

export type RecipeType = 'shaped' | 'shapeless' | 'smithing' | 'stonecutting' | 'smelting' | 'blasting' | 'smoking' | 'campfire';

export type RecipeOrigin = 'vanilla' | 'kubejs' | 'crafttweaker' | 'authored';

export interface RecipeIngredient {
  item: string;
  /** Absent counts arrive as `undefined` (authored) or `null` (loaded pack
   *  recipes — Rust `Option<i32>::None` serializes to null). */
  count?: number | null;
  tag?: boolean;
  nbt?: Record<string, unknown>;
}

export interface RecipeOutput {
  item: string;
  count: number;
  nbt?: Record<string, unknown>;
}

export interface Recipe {
  id: string;
  type: RecipeType;
  name: string;
  group?: string;
  pattern?: string[];
  key?: Record<string, RecipeIngredient>;
  ingredients?: RecipeIngredient[];
  output: RecipeOutput;
  experience?: number;
  cookingTime?: number;
  category?: string;
  /** Provenance of the recipe: where it was loaded from. */
  origin?: RecipeOrigin;
  /** Absolute path of the source file (present for discovered recipes). */
  source?: string;
  /** False ⟺ read-only mod-jar recipe (cannot be edited in place). Sent by the
   *  backend on discovered recipes; absent/undefined on authored recipes. */
  editable?: boolean;
  /** 1-based line range of the call in `source` (KubeJS/CraftTweaker only) —
   *  the target of the comment-out disable mechanism. */
  sourceLines?: { start: number; end: number };
  /** Authored only: disabled ⟹ excluded from script emission. */
  disabled?: boolean;
  /** Authored only: edited/created since the last save. Powers the "Changed"
   *  filter; cleared by `markClean`. */
  modified?: boolean;
}

/** A comment-out disable of a KubeJS/CraftTweaker recipe call, persisted so it
 *  stays visible + re-enable-able after a rescan removes the recipe from the
 *  pack list. `fingerprint` = SHA-256 (hex) of the original pre-comment lines. */
export interface DisabledScriptEntry {
  file: string;
  startLine: number;
  endLine: number;
  name: string;
  outputItem: string;
  type: RecipeType;
  fingerprint: string;
}

export interface RecipeState {
  recipes: Recipe[];
  selectedRecipeId: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Resource ids (`ns:file`) disabled via remove-by-id emission (vanilla/jar). */
  disabledIds: string[];
  /** Comment-out disables of KubeJS/CraftTweaker calls (persisted manifest). */
  disabledScripts: DisabledScriptEntry[];
  addRecipe: (recipe: Omit<Recipe, 'id'>) => string;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  bulkDeleteRecipes: (ids: string[]) => void;
  reorderRecipes: (from: number, to: number) => void;
  selectRecipe: (id: string | null) => void;
  setRecipes: (recipes: Recipe[]) => void;
  loadRecipesFromPack: (recipes: Recipe[]) => number;
  markClean: () => void;
  markDirty: () => void;
  duplicateRecipe: (id: string) => string | null;
  getSelectedRecipe: () => Recipe | null;
  toggleDisableById: (id: string) => void;
  toggleDisableAuthored: (id: string) => void;
  addDisabledScript: (entry: DisabledScriptEntry) => void;
  removeDisabledScript: (file: string, startLine: number) => void;
  isDisabled: (recipe: Recipe | null | undefined) => boolean;
  undo: () => void;
  redo: () => void;
}
