import { describe, it, expect, beforeEach } from 'vitest';
import { useRecipeStore } from './recipe-store';
import type { Recipe } from './recipe-store';

function makeRecipe(name: string): Omit<Recipe, 'id'> {
  return {
    type: 'shaped',
    name,
    pattern: ['AAA', 'AAA', 'AAA'],
    key: { A: { item: 'minecraft:dirt' } },
    output: { item: 'minecraft:diamond', count: 1 },
  };
}

describe('recipe-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useRecipeStore.setState({ recipes: [], selectedRecipeId: null, dirty: false, canUndo: false, canRedo: false });
  });

  it('adds a recipe and sets dirty', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('test'));
    const state = useRecipeStore.getState();
    expect(state.recipes).toHaveLength(1);
    expect(state.recipes[0].id).toBe(id);
    expect(state.recipes[0].name).toBe('test');
    expect(state.dirty).toBe(true);
  });

  it('updates a recipe', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('original'));
    useRecipeStore.getState().updateRecipe(id, { name: 'updated' });
    const recipe = useRecipeStore.getState().recipes.find((r) => r.id === id);
    expect(recipe?.name).toBe('updated');
  });

  it('deletes a recipe', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('delete-me'));
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
    useRecipeStore.getState().deleteRecipe(id);
    expect(useRecipeStore.getState().recipes).toHaveLength(0);
  });

  it('undo restores previous state', () => {
    useRecipeStore.getState().addRecipe(makeRecipe('first'));
    useRecipeStore.getState().addRecipe(makeRecipe('second'));
    expect(useRecipeStore.getState().recipes).toHaveLength(2);

    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
    expect(useRecipeStore.getState().recipes[0].name).toBe('first');
  });

  it('redo restores undone state', () => {
    useRecipeStore.getState().addRecipe(makeRecipe('first'));
    useRecipeStore.getState().addRecipe(makeRecipe('second'));
    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes).toHaveLength(1);

    useRecipeStore.getState().redo();
    expect(useRecipeStore.getState().recipes).toHaveLength(2);
  });

  it('update is undoable', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('original'));
    useRecipeStore.getState().updateRecipe(id, { name: 'changed' });
    expect(useRecipeStore.getState().recipes[0].name).toBe('changed');

    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes[0].name).toBe('original');
  });

  it('delete is undoable', () => {
    const recipeId = useRecipeStore.getState().addRecipe(makeRecipe('temp'));
    expect(useRecipeStore.getState().recipes).toHaveLength(1);

    useRecipeStore.getState().deleteRecipe(recipeId);
    expect(useRecipeStore.getState().recipes).toHaveLength(0);

    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
    expect(useRecipeStore.getState().recipes[0].name).toBe('temp');
  });

  it('multiple undos step back through history', () => {
    useRecipeStore.getState().addRecipe(makeRecipe('first'));
    useRecipeStore.getState().addRecipe(makeRecipe('second'));
    useRecipeStore.getState().addRecipe(makeRecipe('third'));
    expect(useRecipeStore.getState().recipes).toHaveLength(3);

    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes).toHaveLength(2);
    useRecipeStore.getState().undo();
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
    expect(useRecipeStore.getState().recipes[0].name).toBe('first');
  });

  it('setRecipes clears undo/redo stacks', () => {
    useRecipeStore.getState().addRecipe(makeRecipe('a'));
    useRecipeStore.getState().addRecipe(makeRecipe('b'));
    expect(useRecipeStore.getState().canUndo).toBe(true);

    useRecipeStore.getState().setRecipes([{ ...makeRecipe('fresh'), id: 'fresh' }]);
    expect(useRecipeStore.getState().canUndo).toBe(false);
    expect(useRecipeStore.getState().canRedo).toBe(false);

    useRecipeStore.getState().undo(); // should be no-op
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
  });

  it('loadRecipesFromPack appends distinct recipes even when outputs collide', () => {
    const discovered = [
      // Two recipes from different files sharing the same output must BOTH load.
      { ...makeRecipe('from-a'), id: 'a', origin: 'kubejs' as const, source: '/x/recipes_a.js', output: { item: 'minecraft:stone', count: 1 } },
      { ...makeRecipe('from-b'), id: 'b', origin: 'kubejs' as const, source: '/x/recipes_b.js', output: { item: 'minecraft:stone', count: 1 } },
      { ...makeRecipe('from-json'), id: 'c', origin: 'vanilla' as const, source: '/data/mc/recipes/x.json' },
    ];
    const added = useRecipeStore.getState().loadRecipesFromPack(discovered);
    expect(added).toBe(3);
    expect(useRecipeStore.getState().recipes).toHaveLength(3);
    expect(useRecipeStore.getState().dirty).toBe(true);

    // Same sources again -> deduped, nothing added.
    const again = useRecipeStore.getState().loadRecipesFromPack(discovered);
    expect(again).toBe(0);
    expect(useRecipeStore.getState().recipes).toHaveLength(3);
  });

  it('loadRecipesFromPack preserves authored recipes', () => {
    const authored = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().loadRecipesFromPack([
      { ...makeRecipe('pack'), id: 'p', origin: 'vanilla' as const, source: '/data/x.json' },
    ]);
    const ids = useRecipeStore.getState().recipes.map((r) => r.id);
    expect(ids).toContain(authored);
    expect(ids).toContain('p');
  });
});
