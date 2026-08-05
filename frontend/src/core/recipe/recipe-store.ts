import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface RecipeSnapshot {
  recipes: Recipe[];
  selectedRecipeId: string | null;
}

const MAX_UNDO = 50;
let undoStack: RecipeSnapshot[] = [];
let redoStack: RecipeSnapshot[] = [];

function takeSnapshot(state: { recipes: Recipe[]; selectedRecipeId: string | null }): RecipeSnapshot {
  return {
    recipes: JSON.parse(JSON.stringify(state.recipes)),
    selectedRecipeId: state.selectedRecipeId,
  };
}

interface RecipeState {
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

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      recipes: [],
      selectedRecipeId: null,
      dirty: false,
      canUndo: false,
      canRedo: false,
      disabledIds: [],
      disabledScripts: [],

      addRecipe: (recipe) => {
        const id = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newRecipe = {
          ...recipe,
          id,
          origin: 'authored' as const,
          editable: true,
          disabled: false,
          modified: true,
        };
        set((state) => {
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          return {
            recipes: [...state.recipes, newRecipe],
            selectedRecipeId: id,
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
        return id;
      },

      updateRecipe: (id, updates) => {
        set((state) => {
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          return {
            recipes: state.recipes.map((r) => {
              if (r.id !== id) return r;
              // `modified` only tracks authored recipes (discovered rows are
              // reloadable from the pack scan and never dirty).
              const modified = r.origin === 'authored' ? true : r.modified;
              return { ...r, ...updates, modified };
            }),
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
      },

      deleteRecipe: (id) => {
        set((state) => {
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          return {
            recipes: state.recipes.filter((r) => r.id !== id),
            selectedRecipeId: state.selectedRecipeId === id ? null : state.selectedRecipeId,
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
      },

      bulkDeleteRecipes: (ids) => {
        set((state) => {
          const idSet = new Set(ids);
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          const remaining = state.recipes.filter((r) => !idSet.has(r.id));
          return {
            recipes: remaining,
            selectedRecipeId: idSet.has(state.selectedRecipeId ?? '') ? (remaining[0]?.id ?? null) : state.selectedRecipeId,
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
      },

      reorderRecipes: (from, to) => {
        set((state) => {
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          const next = [...state.recipes];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return {
            recipes: next,
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
      },

      selectRecipe: (id) => {
        set({ selectedRecipeId: id });
      },

      setRecipes: (recipes) => {
        undoStack = [];
        redoStack = [];
        set({ recipes, dirty: false, canUndo: false, canRedo: false });
      },

      loadRecipesFromPack: (discovered) => {
        // Dedupe by source resource id (the discovered recipe's `id` is the
        // `ns:file` resource id) so distinct recipes that share an output item
        // are NOT collapsed, and re-importing the same pack is idempotent.
        const existing = new Set(
          get().recipes.map((r) => `${r.origin ?? 'authored'}:${r.source ?? r.id}`)
        );
        const fresh = discovered.filter((r) => {
          const key = `${r.origin ?? 'authored'}:${r.source ?? r.id}`;
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        });
        if (fresh.length === 0) return 0;
        set((state) => ({
          recipes: [...state.recipes, ...fresh],
          dirty: true,
        }));
        return fresh.length;
      },

      markClean: () => {
        set((state) => ({
          dirty: false,
          recipes: state.recipes.map((r) =>
            r.origin === 'authored' ? { ...r, modified: false } : r
          ),
        }));
      },

      markDirty: () => {
        set({ dirty: true });
      },

      duplicateRecipe: (id) => {
        const recipe = get().recipes.find((r) => r.id === id);
        if (!recipe) return null;
        const newId = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newRecipe = {
          ...recipe,
          id: newId,
          name: `${recipe.name} (copy)`,
          origin: 'authored' as const,
          editable: true,
          source: undefined,
          sourceLines: undefined,
          disabled: false,
          modified: true,
        };
        set((state) => {
          undoStack.push(takeSnapshot(state));
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          redoStack = [];
          return {
            recipes: [...state.recipes, newRecipe],
            dirty: true,
            canUndo: undoStack.length > 0,
            canRedo: false,
          };
        });
        return newId;
      },

      getSelectedRecipe: () => {
        const { recipes, selectedRecipeId } = get();
        return recipes.find((r) => r.id === selectedRecipeId) || null;
      },

      toggleDisableById: (id) => {
        set((state) => {
          const has = state.disabledIds.includes(id);
          return {
            disabledIds: has
              ? state.disabledIds.filter((x) => x !== id)
              : [...state.disabledIds, id],
            dirty: true,
          };
        });
      },

      toggleDisableAuthored: (id) => {
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id
              ? { ...r, disabled: !(r.disabled === true), modified: true }
              : r
          ),
          dirty: true,
        }));
      },

      addDisabledScript: (entry) => {
        set((state) => {
          const exists = state.disabledScripts.some(
            (e) => e.file === entry.file && e.startLine === entry.startLine
          );
          return {
            disabledScripts: exists
              ? state.disabledScripts
              : [...state.disabledScripts, entry],
            dirty: true,
          };
        });
      },

      removeDisabledScript: (file, startLine) => {
        set((state) => ({
          disabledScripts: state.disabledScripts.filter(
            (e) => !(e.file === file && e.startLine === startLine)
          ),
          dirty: true,
        }));
      },

      isDisabled: (recipe) => {
        if (!recipe) return false;
        if (recipe.origin === 'authored') return recipe.disabled === true;
        if (recipe.origin === 'vanilla') return get().disabledIds.includes(recipe.id);
        // kubejs / crafttweaker: disabled ⟺ a comment-out manifest entry matches.
        if (recipe.source && recipe.sourceLines) {
          return get().disabledScripts.some(
            (e) => e.file === recipe.source && e.startLine === recipe.sourceLines!.start
          );
        }
        return false;
      },

      undo: () => {
        const state = get();
        if (undoStack.length === 0) return;
        const snapshot = undoStack.pop()!;
        redoStack.push(takeSnapshot(state));
        set({
          recipes: snapshot.recipes,
          selectedRecipeId: snapshot.selectedRecipeId,
          dirty: true,
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
        });
      },

      redo: () => {
        const state = get();
        if (redoStack.length === 0) return;
        const snapshot = redoStack.pop()!;
        undoStack.push(takeSnapshot(state));
        set({
          recipes: snapshot.recipes,
          selectedRecipeId: snapshot.selectedRecipeId,
          dirty: true,
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
        });
      },
    }),
    {
      name: 'modcanvas-recipe-store',
      // Only authored recipes are persisted. Discovered pack recipes (vanilla /
      // kubejs / crafttweaker) are reloadable from the pack scan and must never
      // be serialized — a real pack has tens of thousands of recipes, which
      // would exceed localStorage quota and synchronously serialize on every
      // store write (freezing the UI during a large import).
      partialize: (state) => ({
        recipes: state.recipes.filter((r) => !r.origin || r.origin === 'authored'),
        selectedRecipeId: state.selectedRecipeId,
        disabledIds: state.disabledIds,
        disabledScripts: state.disabledScripts,
      }),
    }
  )
);

export const getRecipeStore = () => useRecipeStore.getState();
