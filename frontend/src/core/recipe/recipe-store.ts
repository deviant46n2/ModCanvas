// Recipe store (zustand + persist). Types live in `./recipe-store/types` and
// the undo/redo history stack in `./recipe-store/history`.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RecipeState } from './recipe-store/types';
import {
  takeSnapshot,
  recordMutation,
  clearHistory,
  popUndo,
  pushUndo,
  pushRedo,
  popRedo,
  undoDepth,
  redoDepth,
} from './recipe-store/history';
export type { RecipeType, RecipeOrigin, RecipeIngredient, RecipeOutput, Recipe, DisabledScriptEntry } from './recipe-store/types';

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
          recordMutation(takeSnapshot(state));
          return {
            recipes: [...state.recipes, newRecipe],
            selectedRecipeId: id,
            dirty: true,
            canUndo: undoDepth() > 0,
            canRedo: false,
          };
        });
        return id;
      },

      updateRecipe: (id, updates) => {
        set((state) => {
          recordMutation(takeSnapshot(state));
          return {
            recipes: state.recipes.map((r) => {
              if (r.id !== id) return r;
              // `modified` only tracks authored recipes (discovered rows are
              // reloadable from the pack scan and never dirty).
              const modified = r.origin === 'authored' ? true : r.modified;
              return { ...r, ...updates, modified };
            }),
            dirty: true,
            canUndo: undoDepth() > 0,
            canRedo: false,
          };
        });
      },

      deleteRecipe: (id) => {
        set((state) => {
          recordMutation(takeSnapshot(state));
          return {
            recipes: state.recipes.filter((r) => r.id !== id),
            selectedRecipeId: state.selectedRecipeId === id ? null : state.selectedRecipeId,
            dirty: true,
            canUndo: undoDepth() > 0,
            canRedo: false,
          };
        });
      },

      bulkDeleteRecipes: (ids) => {
        set((state) => {
          const idSet = new Set(ids);
          recordMutation(takeSnapshot(state));
          const remaining = state.recipes.filter((r) => !idSet.has(r.id));
          return {
            recipes: remaining,
            selectedRecipeId: idSet.has(state.selectedRecipeId ?? '') ? (remaining[0]?.id ?? null) : state.selectedRecipeId,
            dirty: true,
            canUndo: undoDepth() > 0,
            canRedo: false,
          };
        });
      },

      reorderRecipes: (from, to) => {
        set((state) => {
          recordMutation(takeSnapshot(state));
          const next = [...state.recipes];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return {
            recipes: next,
            dirty: true,
            canUndo: undoDepth() > 0,
            canRedo: false,
          };
        });
      },

      selectRecipe: (id) => {
        set({ selectedRecipeId: id });
      },

      setRecipes: (recipes) => {
        clearHistory();
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
          recordMutation(takeSnapshot(state));
          return {
            recipes: [...state.recipes, newRecipe],
            dirty: true,
            canUndo: undoDepth() > 0,
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
        const snapshot = popUndo();
        if (!snapshot) return;
        pushRedo(takeSnapshot(state));
        set({
          recipes: snapshot.recipes,
          selectedRecipeId: snapshot.selectedRecipeId,
          dirty: true,
          canUndo: undoDepth() > 0,
          canRedo: redoDepth() > 0,
        });
      },

      redo: () => {
        const state = get();
        const snapshot = popRedo();
        if (!snapshot) return;
        pushUndo(takeSnapshot(state));
        set({
          recipes: snapshot.recipes,
          selectedRecipeId: snapshot.selectedRecipeId,
          dirty: true,
          canUndo: undoDepth() > 0,
          canRedo: redoDepth() > 0,
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
