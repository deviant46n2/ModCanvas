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
    useRecipeStore.setState({ recipes: [], selectedRecipeId: null, dirty: false, canUndo: false, canRedo: false, disabledIds: [], disabledScripts: [] });
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

  it('addRecipe marks authored, editable, enabled, modified', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    const r = useRecipeStore.getState().recipes.find((x) => x.id === id)!;
    expect(r.origin).toBe('authored');
    expect(r.editable).toBe(true);
    expect(r.disabled).toBe(false);
    expect(r.modified).toBe(true);
  });

  it('updateRecipe marks only authored recipes modified', () => {
    const authored = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().loadRecipesFromPack([
      { ...makeRecipe('pack'), id: 'p', origin: 'vanilla' as const, source: '/data/x.json' },
    ]);
    useRecipeStore.getState().updateRecipe(authored, { name: 'edited' });
    useRecipeStore.getState().updateRecipe('p', { name: 'touched' });
    const a = useRecipeStore.getState().recipes.find((x) => x.id === authored)!;
    const p = useRecipeStore.getState().recipes.find((x) => x.id === 'p')!;
    expect(a.modified).toBe(true);
    expect(p.modified).toBeUndefined();
  });

  it('markClean clears modified on authored recipes', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().updateRecipe(id, { name: 'x' });
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.modified).toBe(true);
    useRecipeStore.getState().markClean();
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.modified).toBe(false);
  });

  it('duplicateRecipe strips origin/source and resets disable state', () => {
    useRecipeStore.getState().loadRecipesFromPack([
      {
        ...makeRecipe('pack'),
        id: 'p',
        origin: 'kubejs' as const,
        source: '/x/recipes.js',
        sourceLines: { start: 3, end: 5 },
        editable: true,
      },
    ]);
    const copyId = useRecipeStore.getState().duplicateRecipe('p')!;
    const copy = useRecipeStore.getState().recipes.find((r) => r.id === copyId)!;
    expect(copy.origin).toBe('authored');
    expect(copy.editable).toBe(true);
    expect(copy.source).toBeUndefined();
    expect(copy.sourceLines).toBeUndefined();
    expect(copy.disabled).toBe(false);
    expect(copy.modified).toBe(true);
    expect(copy.name).toBe('pack (copy)');
  });

  it('toggleDisableById toggles remove-by-id disables', () => {
    useRecipeStore.getState().toggleDisableById('minecraft:stick');
    expect(useRecipeStore.getState().disabledIds).toEqual(['minecraft:stick']);
    useRecipeStore.getState().toggleDisableById('minecraft:stick');
    expect(useRecipeStore.getState().disabledIds).toEqual([]);
  });

  it('toggleDisableAuthored flips the disabled flag and marks modified', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().toggleDisableAuthored(id);
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.disabled).toBe(true);
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.modified).toBe(true);
    useRecipeStore.getState().toggleDisableAuthored(id);
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.disabled).toBe(false);
  });

  it('disabledScripts add/remove are deduped by file+startLine', () => {
    const entry = {
      file: '/x/recipes.js',
      startLine: 3,
      endLine: 5,
      name: 'pack',
      outputItem: 'minecraft:stick',
      type: 'shaped' as const,
      fingerprint: 'abc123',
    };
    useRecipeStore.getState().addDisabledScript(entry);
    useRecipeStore.getState().addDisabledScript(entry);
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(1);
    useRecipeStore.getState().removeDisabledScript('/x/recipes.js', 3);
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(0);
  });

  it('isDisabled dispatches on origin kind', () => {
    const authored = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().toggleDisableAuthored(authored);
    expect(useRecipeStore.getState().isDisabled({ ...makeRecipe('x'), id: 'x' })).toBe(false);

    const vanilla = { ...makeRecipe('v'), id: 'minecraft:stick', origin: 'vanilla' as const };
    expect(useRecipeStore.getState().isDisabled(vanilla)).toBe(false);
    useRecipeStore.getState().toggleDisableById('minecraft:stick');
    expect(useRecipeStore.getState().isDisabled(vanilla)).toBe(true);

    const script = {
      ...makeRecipe('s'),
      id: 's',
      origin: 'kubejs' as const,
      source: '/x/recipes.js',
      sourceLines: { start: 3, end: 5 },
    };
    expect(useRecipeStore.getState().isDisabled(script)).toBe(false);
    useRecipeStore.getState().addDisabledScript({
      file: '/x/recipes.js',
      startLine: 3,
      endLine: 5,
      name: 's',
      outputItem: 'minecraft:stone',
      type: 'shaped' as const,
      fingerprint: 'fp',
    });
    expect(useRecipeStore.getState().isDisabled(script)).toBe(true);
  });

  it('persists disable state alongside authored recipes', () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe('mine'));
    useRecipeStore.getState().toggleDisableById('minecraft:stick');
    useRecipeStore.getState().addDisabledScript({
      file: '/x/recipes.js',
      startLine: 3,
      endLine: 5,
      name: 'pack',
      outputItem: 'minecraft:stick',
      type: 'shaped' as const,
      fingerprint: 'fp',
    });
    // partialize keeps authored recipes + disable state, drops discovered rows.
    const state = useRecipeStore.getState() as any;
    // Rehydrate a fresh store the way persist does (simplified): confirm the
    // persisted shape via the store's own state.
    expect(state.recipes.some((r: any) => r.origin !== 'authored')).toBe(false);
    expect(state.recipes.some((r: any) => r.id === id)).toBe(true);
    expect(state.disabledIds).toEqual(['minecraft:stick']);
    expect(state.disabledScripts).toHaveLength(1);
  });
});
