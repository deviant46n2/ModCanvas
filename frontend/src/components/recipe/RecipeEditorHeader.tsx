interface RecipeEditorHeaderProps {
  mcVersion: string;
  loader: string;
  showScriptPreview: boolean;
  onToggleScriptPreview: () => void;
  reloading: boolean;
  reloadMsg: string;
  onReload: () => void;
  onImport: () => void;
  /** Open the guided "Add a recipe" wizard (P0-MINIWIZ). */
  onAddGuided?: () => void;
}

export function RecipeEditorHeader({
  mcVersion,
  loader,
  showScriptPreview,
  onToggleScriptPreview,
  reloading,
  reloadMsg,
  onReload,
  onImport,
  onAddGuided,
}: RecipeEditorHeaderProps) {
  return (
    <header className="recipe-editor-header">
      <h2>Recipe Editor <span className="recipe-adapter-badge">{mcVersion}/{loader}</span></h2>
      <div className="header-actions">
        {onAddGuided && (
          <button type="button" className="btn-secondary" onClick={onAddGuided} title="Guided recipe — pick an output and ingredients, the wizard writes it">
            ✨ Add a recipe
          </button>
        )}
        <button
          type="button"
          className={`script-toggle ${showScriptPreview ? 'active' : ''}`}
          onClick={onToggleScriptPreview}
          title="Show the raw generated KubeJS/CraftTweaker script (opt-in)"
        >
          Script
        </button>
        <button className="btn-secondary" onClick={onReload} disabled={reloading} title="Re-scan the pack for recipes (cache-aware)">
          {reloading ? 'Reloading…' : 'Reload Recipes'}
        </button>
        {reloadMsg && <span className="search-loading">{reloadMsg}</span>}
        <button className="btn-secondary" onClick={onImport}>Import JSON</button>
      </div>
    </header>
  );
}

export default RecipeEditorHeader;
