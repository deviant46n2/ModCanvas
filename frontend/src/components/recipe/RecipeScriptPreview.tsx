import { useRecipeScripts } from '../../hooks/useRecipeScripts';
import type { Recipe } from '../../core/recipe/recipe-store';

interface RecipeScriptPreviewProps {
  projectId: string;
  recipe: Recipe;
  loader: string;
}

/** Live read-only render of the generated KubeJS / CraftTweaker script for a
 * single recipe, tinted by which emitter the active loader writes to. */
export function RecipeScriptPreview({ projectId, recipe, loader }: RecipeScriptPreviewProps) {
  const isCraftTweaker = /crafttweaker|ct/i.test(loader ?? '');
  const { script, loading, error } = useRecipeScripts(projectId, recipe, isCraftTweaker);

  return (
    <div className="recipe-script-preview">
      <div className="preview-head">
        <span className={`preview-badge ${isCraftTweaker ? 'is-ct' : 'is-kubejs'}`}>
          {isCraftTweaker ? 'CraftTweaker .zs' : 'KubeJS .js'}
        </span>
        <span className="preview-note">Preview only — save writes to the on-disk script.</span>
      </div>
      {loading && <div className="preview-loading">Rendering…</div>}
      {error && <div className="preview-error">{error}</div>}
      {!loading && !error && (
        <pre className="preview-code">{script || '// nothing to emit'}</pre>
      )}
    </div>
  );
}

export default RecipeScriptPreview;
