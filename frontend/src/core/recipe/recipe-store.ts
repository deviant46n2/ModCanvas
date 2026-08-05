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

      addRecipe: (recipe) => {
        const id = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newRecipe = { ...recipe, id };
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
            recipes: state.recipes.map((r) =>
              r.id === id ? { ...r, ...updates } : r
            ),
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
        set({ dirty: false });
      },

      markDirty: () => {
        set({ dirty: true });
      },

      duplicateRecipe: (id) => {
        const recipe = get().recipes.find((r) => r.id === id);
        if (!recipe) return null;
        const newId = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newRecipe = { ...recipe, id: newId, name: `${recipe.name} (copy)` };
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
      }),
    }
  )
);

export const getRecipeStore = () => useRecipeStore.getState();
