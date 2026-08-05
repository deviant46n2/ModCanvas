import { useState } from 'react';
import { useRecipeScripts } from '../../hooks/useRecipeScripts';
import type { Recipe } from '../../core/recipe/recipe-store';

interface RecipeScriptPreviewProps {
  projectId: string;
  recipes: Recipe[];
  loader: string;
}

/** Live read-only render of the full on-disk generated script (all saveable
 *  recipes — the same content the save button writes), tinted by which emitter
 *  the active loader writes to. Opt-in only: hidden by default in the editor. */
export function RecipeScriptPreview({ projectId, recipes, loader }: RecipeScriptPreviewProps) {
  const isCraftTweaker = /crafttweaker|ct/i.test(loader ?? '');
  const { script, loading, error } = useRecipeScripts(projectId, recipes, isCraftTweaker);
  const [copied, setCopied] = useState(false);

  const filePath = isCraftTweaker
    ? 'scripts/modcanvas_crafttweaker.zs'
    : 'kubejs/server_scripts/modcanvas_recipes.js';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="recipe-script-preview">
      <div className="preview-head">
        <span className={`preview-badge ${isCraftTweaker ? 'is-ct' : 'is-kubejs'}`}>
          {isCraftTweaker ? 'CraftTweaker .zs' : 'KubeJS .js'}
        </span>
        <code className="preview-path">{filePath}</code>
        <button
          type="button"
          className="preview-copy"
          onClick={copy}
          disabled={loading || !script}
          title="Copy the exact generated file content"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="preview-note">Full on-disk script — save writes this exact content.</div>
      {loading && <div className="preview-loading">Rendering…</div>}
      {error && <div className="preview-error">{error}</div>}
      {!loading && !error && (
        <pre className="preview-code">{script || '// nothing to emit'}</pre>
      )}
    </div>
  );
}

export default RecipeScriptPreview;
