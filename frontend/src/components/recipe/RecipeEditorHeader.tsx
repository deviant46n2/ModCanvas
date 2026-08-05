interface RecipeEditorHeaderProps {
  mcVersion: string;
  loader: string;
  showScriptPreview: boolean;
  onToggleScriptPreview: () => void;
  reloading: boolean;
  reloadMsg: string;
  onReload: () => void;
  onImport: () => void;
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
}: RecipeEditorHeaderProps) {
  return (
    <header className="recipe-editor-header">
      <h2>Recipe Editor <span className="recipe-adapter-badge">{mcVersion}/{loader}</span></h2>
      <div className="header-actions">
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
