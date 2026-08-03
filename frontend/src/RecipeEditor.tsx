import { useState, useEffect, useCallback } from 'react';
import { useRecipeStore } from './core/recipe/recipe-store';
import { RecipePalette } from './components/recipe/RecipePalette';
import { RecipeList } from './components/recipe/RecipeList';
import { CraftingGridPanel } from './components/recipe/CraftingGridPanel';
import { ImportRecipesModal } from './components/recipe/ImportRecipesModal';
import { LoadPackRecipesModal } from './components/recipe/LoadPackRecipesModal';
import { RecipeScriptPreview } from './components/recipe/RecipeScriptPreview';
import type { ImportedRecipe } from './core/recipe/json-import';
import { searchItems, searchTags, scanInstanceTextures, generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from './services/api';
import { getAdapter } from './adapters';
import { normalizeLoader } from './core/recipe/loader';
import { validateRecipe, hasErrors, issuesByPath } from './core/recipe/validation';
import { patternToGrid, gridToPattern } from './core/recipe/grid';
import { requestMaterialize, subscribeMaterialized, textureDisplayUrl, isTexturePending, registerBakedKeysFromIndex } from './services/texture-loader';
import type { Recipe, RecipeIngredient } from './core/recipe/recipe-store';
import type { SearchResult, TagInfo } from './services/api';
import './RecipeEditor.css';

interface RecipeEditorProps {
  projectId: string;
  projectPath: string;
  minecraftVersion?: string;
  modLoader?: string;
}

export function RecipeEditor({ projectId, projectPath, minecraftVersion = '1.21.1', modLoader }: RecipeEditorProps) {
  const {
    recipes,
    selectedRecipeId,
    dirty,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    bulkDeleteRecipes,
    reorderRecipes,
    selectRecipe,
    duplicateRecipe,
    markClean,
    getSelectedRecipe,
    loadRecipesFromPack,
  } = useRecipeStore();

  // Resolve the adapter for this pack's version + loader so item/tag search and
  // the hotswap reload path are correct instead of hardcoded neoforge/1.21.1.
  const adapter = getAdapter(minecraftVersion, normalizeLoader(modLoader));
  const recipeScriptPath = `${adapter.getRecipeScriptPath(projectPath)}/modcanvas_recipes.js`;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchTab, setActiveSearchTab] = useState<'items' | 'tags'>('items');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [tagResults, setTagResults] = useState<TagInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedItem, setDraggedItem] = useState<SearchResult | null>(null);
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({});
  const [, setTextureTick] = useState(0);
  const [indexLoading, setIndexLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showLoadPack, setShowLoadPack] = useState(false);

  const selectedRecipe = getSelectedRecipe();
  const recipeIssues = selectedRecipe ? validateRecipe(selectedRecipe) : [];
  const issues = issuesByPath(recipeIssues);
  const hasBlockingErrors = hasErrors(recipeIssues);

  // Compact texture index (descriptors only — never base64). Icons are
  // materialized lazily in batches via the shared texture-loader, so opening
  // the Recipes tab does not pull every mod's textures into memory.
  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    setIndexLoading(true);
    scanInstanceTextures(projectPath)
      .then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return;
        registerBakedKeysFromIndex(idx);
        setTextureIndex((prev) => ({ ...prev, ...idx }));
      })
      .catch((e) => console.error('Failed to load texture index:', e))
      .finally(() => { if (!cancelled) setIndexLoading(false); });
    return () => { cancelled = true; };
  }, [projectPath]);

  // Re-render when lazy materialization makes more icons available.
  useEffect(() => {
    return subscribeMaterialized(() => setTextureTick((t) => t + 1));
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setTagResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const [items, tags] = await Promise.all([
        searchItems(query, adapter.loader, adapter.mcVersion),
        searchTags(query, adapter.loader, adapter.mcVersion),
      ]);
      setSearchResults(items);
      setTagResults(tags);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, [adapter.loader, adapter.mcVersion]);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

  const getTextureUrl = (itemId: string): string | null => {
    if (!itemId) return null;
    const key = itemId.replace(/^#/, '');
    const url = textureDisplayUrl(textureIndex, key);
    if (url) return url;
    // Lazy-materialize on demand; show a placeholder until it resolves.
    if (isTexturePending(textureIndex, key)) {
      requestMaterialize([key], projectPath);
    }
    return null;
  };

  const handleGridChange = useCallback((grid: (RecipeIngredient | null)[][]) => {
    const current = getSelectedRecipe();
    if (!current) return;
    if (current.type === 'shaped') {
      const { pattern, key } = gridToPattern(grid, current.key ?? {});
      updateRecipe(current.id, { pattern, key });
    } else if (current.type === 'shapeless') {
      const ingredients = grid.flatMap(row => row.filter((c): c is RecipeIngredient => !!c).map(c => ({ item: c.item, count: c.count, tag: c.tag })));
      updateRecipe(current.id, { ingredients });
    }
  }, [getSelectedRecipe, updateRecipe]);

  const handleSaveRecipes = async () => {
    if (!projectId) return;
    try {
      setShowSaveDialog(true);
      setSaveMessage('Generating scripts...');
      const allRecipes = recipes.filter((r: Recipe) => r.output.item && !hasErrors(validateRecipe(r)));
      if (allRecipes.length !== recipes.length) {
        setSaveMessage(`Saving ${allRecipes.length}/${recipes.length} recipes (skipped invalid).`);
      }
      const { kubejsScript, crafttweakerScript } = await generateRecipeScripts(projectId, allRecipes);
      await writeScriptFiles(projectId, kubejsScript, crafttweakerScript);
      setSaveMessage('Scripts saved successfully!');
      markClean();
      await wsIpcSendEvent('RELOAD_KUBEJS_SCRIPTS', recipeScriptPath);
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage(''); }, 3000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveMessage(`Error: ${e}`);
    }
  };

  const handleNewRecipe = () => {
    const id = addRecipe({
      type: 'shaped',
      name: 'New Recipe',
      group: '',
      pattern: ['   ', '   ', '   '],
      key: {},
      ingredients: [],
      output: { item: '', count: 1 },
    });
    selectRecipe(id);
  };

  const handleImport = (imported: ImportedRecipe[]) => {
    let lastId: string | null = null;
    for (const entry of imported) {
      const { recipe, warnings } = entry;
      // eslint-disable-next-line no-console
      if (warnings.length) console.warn('Import warnings:', recipe.name, warnings);
      lastId = addRecipe({
        type: recipe.type,
        name: recipe.name,
        group: recipe.group,
        pattern: recipe.pattern,
        key: recipe.key,
        ingredients: recipe.ingredients,
        output: recipe.output,
        experience: recipe.experience,
        cookingTime: recipe.cookingTime,
      });
    }
    if (lastId) selectRecipe(lastId);
  };

  const handleDeleteRecipe = () => {
    if (selectedRecipe && window.confirm(`Delete "${selectedRecipe.name}"?`)) {
      deleteRecipe(selectedRecipe.id);
    }
  };

  const handleDuplicateRecipe = () => {
    if (selectedRecipe) {
      const id = duplicateRecipe(selectedRecipe.id);
      if (id) selectRecipe(id);
    }
  };

  const buildInitialGrid = (): (RecipeIngredient | null)[][] => {
    if (!selectedRecipe) return [];
    if (selectedRecipe.type === 'shaped' && selectedRecipe.pattern && selectedRecipe.key) {
      return patternToGrid(selectedRecipe.pattern, selectedRecipe.key);
    }
    if (selectedRecipe.type === 'shapeless') {
      const from = selectedRecipe.ingredients ?? [];
      const grid: (RecipeIngredient | null)[][] = [];
      for (let i = 0; i < from.length; i += 3) {
        const row: (RecipeIngredient | null)[] = [...from.slice(i, i + 3)];
        while (row.length < 3) row.push(null);
        grid.push(row);
      }
      if (grid.length === 0) grid.push([null, null, null]);
      return grid;
    }
    return [];
  };

  const getGridSize = (): 2 | 3 => {
    if (!selectedRecipe) return 3;
    const type = selectedRecipe.type;
    return (type === 'stonecutting' || type === 'smelting' || type === 'blasting' ||
            type === 'smoking' || type === 'campfire') ? 2 : 3;
  };

  return (
    <div className="recipe-editor">
      <header className="recipe-editor-header">
        <h2>Recipe Editor <span className="recipe-adapter-badge">{adapter.mcVersion}/{adapter.loader}</span></h2>
        <div className="header-actions">
          <input type="text" placeholder="Search items/tags..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
          <div className="search-tabs">
            <button className={activeSearchTab === 'items' ? 'active' : ''}
              onClick={() => setActiveSearchTab('items')}>Items</button>
            <button className={activeSearchTab === 'tags' ? 'active' : ''}
              onClick={() => setActiveSearchTab('tags')}>Tags</button>
          </div>
          {isSearching && <span className="search-loading">Loading...</span>}
          <button className="btn-secondary" onClick={() => setShowLoadPack(true)}>Load Pack</button>
          <button className="btn-secondary" onClick={() => setShowImport(true)}>Import JSON</button>
        </div>
      </header>

      <div className="recipe-editor-body">
        {indexLoading ? (
          <RecipeEditorSkeleton />
        ) : (
          <>
        <RecipePalette
          searchResults={searchResults}
          tagResults={tagResults}
          activeSearchTab={activeSearchTab}
          onDragStart={setDraggedItem}
          getTextureUrl={getTextureUrl}
        />

        <main className="recipe-canvas">
          <RecipeList
            recipes={recipes}
            selectedRecipeId={selectedRecipeId}
            onSelectRecipe={selectRecipe}
            onNewRecipe={handleNewRecipe}
            getTextureUrl={getTextureUrl}
            onRename={(id, name) => updateRecipe(id, { name })}
            onBulkDelete={bulkDeleteRecipes}
            onReorder={reorderRecipes}
          />

          {selectedRecipe && (
            <CraftingGridPanel
              selectedRecipe={selectedRecipe}
              onTypeChange={(type) => updateRecipe(selectedRecipe.id, { type })}
              onUpdateRecipe={updateRecipe}
              onGridChange={handleGridChange}
              onSave={handleSaveRecipes}
              onDelete={handleDeleteRecipe}
              onDuplicate={handleDuplicateRecipe}
              getTextureUrl={getTextureUrl}
              getGridSize={getGridSize}
              buildInitialGrid={buildInitialGrid}
              dirty={dirty}
              issues={issues}
              hasBlockingErrors={hasBlockingErrors}
            />
          )}
        </main>

        <aside className="recipe-detail">
          {selectedRecipe && projectId && (
            <RecipeScriptPreview
              projectId={projectId}
              recipe={selectedRecipe}
              loader={adapter.loader}
            />
          )}
          {draggedItem && (
            <div className="detail-card dragged-preview">
              <h4>Dragged Item</h4>
              <div className="detail-item">
                <img src={getTextureUrl(draggedItem.id) || ''} alt="" />
                <div>
                  <strong>{draggedItem.name}</strong>
                  <small>{draggedItem.id}</small>
                </div>
              </div>
              <p>Drop onto the crafting grid to add</p>
            </div>
          )}
        </aside>
        </>
          )}
      </div>

      {showImport && (
        <ImportRecipesModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}
      {showLoadPack && projectPath && (
        <LoadPackRecipesModal
          projectPath={projectPath}
          onClose={() => setShowLoadPack(false)}
          onImport={loadRecipesFromPack}
          existingRecipes={recipes}
        />
      )}

      {showSaveDialog && (
        <div className="save-toast">{saveMessage}</div>
      )}
    </div>
  );
}

/** Placeholder shown while the compact texture index loads. */
function RecipeEditorSkeleton() {
  return (
    <div className="recipe-skeleton">
      <div className="skeleton-palette">
        <div className="skeleton-line w60" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
      <div className="skeleton-canvas">
        <div className="skeleton-line w40" />
        <div className="skeleton-block tall" />
        <div className="skeleton-block tall" />
      </div>
      <div className="skeleton-detail">
        <div className="skeleton-block" />
      </div>
    </div>
  );
}

export default RecipeEditor;
