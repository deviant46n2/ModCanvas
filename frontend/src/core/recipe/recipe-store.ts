import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RecipeType = 'shaped' | 'shapeless' | 'smithing' | 'stonecutting' | 'smelting' | 'blasting' | 'smoking' | 'campfire';

export interface RecipeIngredient {
  item: string;
  count?: number;
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
  selectRecipe: (id: string | null) => void;
  setRecipes: (recipes: Recipe[]) => void;
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

      selectRecipe: (id) => {
        set({ selectedRecipeId: id });
      },

      setRecipes: (recipes) => {
        undoStack = [];
        redoStack = [];
        set({ recipes, dirty: false, canUndo: false, canRedo: false });
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
      partialize: (state) => ({
        recipes: state.recipes,
        selectedRecipeId: state.selectedRecipeId,
      }),
    }
  )
);

export const getRecipeStore = () => useRecipeStore.getState();
