import { useState, useMemo } from 'react';
import { useRecipeScripts } from '../../hooks/useRecipeScripts';
import type { Recipe } from '../../core/recipe/recipe-store';
import { selectSaveableRecipes } from '../../core/recipe/validation';

interface RecipeScriptDrawerProps {
  projectId: string;
  recipes: Recipe[];
  selectedRecipe: Recipe | null;
  loader: string;
}

/** Drawer docked under the editor previewing the generated scripts. Tabs:
 *  "Full file" = the exact on-disk bytes the save writes (all saveable recipes
 *  + remove-by-id disables); "This recipe" = emission for just the selection
 *  (no removes). */
export function RecipeScriptDrawer({ projectId, recipes, selectedRecipe, loader }: RecipeScriptDrawerProps) {
  const [tab, setTab] = useState<'full' | 'recipe'>('full');
  const [copied, setCopied] = useState(false);
  const isCraftTweaker = /crafttweaker|ct/i.test(loader ?? '');

  const full = useRecipeScripts(projectId, recipes, isCraftTweaker);
  const single = useMemo(() => (selectedRecipe ? [selectedRecipe] : []), [selectedRecipe]);
  // Stable [] so the this-recipe hook's effect doesn't re-run (and cancel its
  // own debounce) on every render.
  const noRemoves = useMemo<string[]>(() => [], []);
  const one = useRecipeScripts(projectId, single, isCraftTweaker, noRemoves);

  const active = tab === 'full' ? full : one;
  const filePath = isCraftTweaker
    ? 'scripts/modcanvas_crafttweaker.zs'
    : 'kubejs/server_scripts/modcanvas_recipes.js';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const saveableCount = useMemo(() => selectSaveableRecipes(recipes).length, [recipes]);

  const emptyMessage = (): string => {
    if (tab === 'recipe') {
      if (!selectedRecipe) return '// nothing to emit — select a recipe to preview.';
      if (selectedRecipe.origin !== 'authored')
        return '// nothing to emit — this is a pack/discovered recipe. Use “Edit a copy” to make an editable one.';
      if (selectedRecipe.disabled) return '// nothing to emit — this recipe is disabled.';
      if (!selectedRecipe.output.item) return '// nothing to emit — set an output item first.';
      return '// nothing to emit — fix the recipe validation errors first.';
    }
    if (saveableCount === 0)
      return '// nothing to emit — no authored recipes with an output. Create one, or “Edit a copy” of a discovered recipe.';
    return '// nothing to emit';
  };

  return (
    <div className="recipe-script-drawer">
      <div className="drawer-head">
        <div className="drawer-tabs">
          <button type="button" className={tab === 'full' ? 'active' : ''} onClick={() => setTab('full')}>
            Full file
          </button>
          <button type="button" className={tab === 'recipe' ? 'active' : ''} onClick={() => setTab('recipe')}>
            This recipe
          </button>
        </div>
        <span className={`preview-badge ${isCraftTweaker ? 'is-ct' : 'is-kubejs'}`}>
          {isCraftTweaker ? 'CraftTweaker .zs' : 'KubeJS .js'}
        </span>
        <code className="preview-path">{filePath}</code>
        <button
          type="button"
          className="preview-copy"
          onClick={copy}
          disabled={active.loading || !active.script}
          title="Copy the exact generated file content"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="drawer-note">
        {tab === 'full'
          ? 'Full on-disk script — save writes this exact content.'
          : selectedRecipe
            ? `Emission for "${selectedRecipe.name}" only (no removes).`
            : 'Select a recipe to preview its emission.'}
      </div>
      {active.loading && <div className="preview-loading">Rendering…</div>}
      {active.error && <div className="preview-error">{active.error}</div>}
      {!active.loading && !active.error && (
        <pre className="preview-code">{active.script || emptyMessage()}</pre>
      )}
    </div>
  );
}

export default RecipeScriptDrawer;
