import { useEffect, useState } from 'react';
import { generateRecipeScripts } from '../../services/api';
import type { Recipe } from '../../core/recipe/recipe-store';

interface RecipeScriptPreviewProps {
  projectId: string;
  recipe: Recipe;
  loader: string;
}

/** Live read-only render of the generated KubeJS / CraftTweaker script for a
 * single recipe, tinted by which emitter the active loader writes to. */
export function RecipeScriptPreview({ projectId, recipe, loader }: RecipeScriptPreviewProps) {
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCraftTweaker = /crafttweaker|ct/i.test(loader ?? '');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    generateRecipeScripts(projectId, [recipe as unknown as Record<string, unknown>])
      .then((res) => {
        if (cancelled) return;
        setScript(isCraftTweaker ? res.crafttweakerScript : res.kubejsScript);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, recipe, isCraftTweaker]);

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