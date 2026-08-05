import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRecipeStore } from './core/recipe/recipe-store';
import { RecipePalette } from './components/recipe/RecipePalette';
import { RecipeExplorer } from './components/recipe/RecipeExplorer';
import { CraftingGridPanel } from './components/recipe/CraftingGridPanel';
import { ImportRecipesModal } from './components/recipe/ImportRecipesModal';
import { RecipeScriptPreview } from './components/recipe/RecipeScriptPreview';
import type { ImportedRecipe } from './core/recipe/json-import';
import { useInstanceTextures } from './hooks/useInstanceTextures';
import { useRecipeSave } from './hooks/useRecipeSave';
import { useRecipeDisable, manifestRecipesFrom } from './hooks/useRecipeDisable';
import { usePackHealthStore } from './core/pack-health/pack-health-store';
import { filterRegistryItems } from './services/item-registry';
import { filterTagCatalog } from './core/recipe/tag-filter';
import { scanPackRecipes, scanInstanceItems, listItemTags } from './services/api';
import type { ItemRegistryEntry, ItemTagInfo } from './services/api';
import { getAdapter } from './adapters';
import { normalizeLoader } from './core/recipe/loader';
import { validateRecipe, hasErrors, issuesByPath } from './core/recipe/validation';
import { patternToGrid, gridToPattern, ingredientsToGrid, gridToIngredients } from './core/recipe/grid';
import { requestMaterialize, subscribeMaterialized, textureDisplayUrl, isTexturePending } from './services/texture-loader';
import { AnimationProvider } from './components/quest/animation-context';
import { ItemPickerModal } from './components/common/ItemPickerModal';
import type { Recipe, RecipeIngredient } from './core/recipe/recipe-store';
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
    selectRecipe,
    duplicateRecipe,
    markClean,
    getSelectedRecipe,
    loadRecipesFromPack,
    isDisabled,
    disabledScripts,
  } = useRecipeStore();

  // Resolve the adapter for this pack's version + loader so item/tag search and
  // the hotswap reload path are correct instead of hardcoded neoforge/1.21.1.
  const adapter = getAdapter(minecraftVersion, normalizeLoader(modLoader));
  const recipeScriptPath = `${adapter.getRecipeScriptPath(projectPath)}/modcanvas_recipes.js`;
  const kubejsNamespace = adapter.getKubejsDefaultNamespace();

  const [activeSearchTab, setActiveSearchTab] = useState<'items' | 'tags'>('items');
  const [searchQuery, setSearchQuery] = useState('');

  const { textureIndex, animations, loading: indexLoading } = useInstanceTextures(projectPath);
  const { showSaveDialog, saveMessage, save: saveRecipes } = useRecipeSave(projectId, recipeScriptPath);
  const { toggleDisable } = useRecipeDisable(projectId);
  const manifestRecipes = useMemo(() => manifestRecipesFrom(disabledScripts), [disabledScripts]);

  const handleToggleDisable = async (recipe: Recipe) => {
    try {
      await toggleDisable(recipe);
    } catch (e) {
      window.alert(String(e));
    }
  };

  // Instance item registry + local tag catalog back the two palette tabs. The
  // quest editor may already have scanned this instance; only scan here when
  // the store is empty so the two editors share one scan.
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry) ?? ([] as ItemRegistryEntry[]);
  const setItemRegistry = usePackHealthStore((s) => s.setItemRegistry);
  const [tagCatalog, setTagCatalog] = useState<ItemTagInfo[]>([]);
  const registryFiltered = useMemo(
    () => filterRegistryItems(itemRegistry, searchQuery),
    [itemRegistry, searchQuery],
  );
  const tagFiltered = useMemo(
    () => filterTagCatalog(tagCatalog, searchQuery),
    [tagCatalog, searchQuery],
  );
  const registryUrlById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of itemRegistry) {
      if (item.texture_data_url) map.set(item.id, item.texture_data_url)
    }
    return map
  }, [itemRegistry]);
  const [draggedItem, setDraggedItem] = useState<{ item: string; name: string } | null>(null);
  const [, setTextureTick] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState('');
  // The raw generated-script preview is opt-in for veterans — hidden by default
  // so beginners never hit code. Sticky across sessions via localStorage.
  const [showScriptPreview, setShowScriptPreview] = useState(
    () => localStorage.getItem('modcanvas:recipe-script-preview') === '1',
  );
  const toggleScriptPreview = () => {
    setShowScriptPreview((prev) => {
      const next = !prev;
      localStorage.setItem('modcanvas:recipe-script-preview', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const [registry, tags] = await Promise.all([
          scanInstanceItems(projectPath, kubejsNamespace),
          listItemTags(projectPath),
        ]);
        if (disposed) return;
        setTagCatalog(tags);
        if (usePackHealthStore.getState().itemRegistry === null) {
          setItemRegistry(registry);
        }
      } catch (e) {
        console.error('[RecipeEditor] Failed to load item registry:', e);
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, [projectPath, kubejsNamespace, setItemRegistry]);

  // Reload recipes from the pack (recipes are auto-loaded when the pack opens;
  // this re-scans in case files changed since). Idempotent — existing recipes
  // are kept, new/changed ones are merged in.
  const reloadRecipes = useCallback(async () => {
    setReloading(true);
    setReloadMsg('');
    try {
      const discovered = await scanPackRecipes(projectPath);
      const withMeta = discovered.map((r) => ({
        ...r.recipe,
        origin: r.origin,
        source: r.source,
        editable: r.editable,
        sourceLines: r.span ?? undefined,
      }));
      const added = loadRecipesFromPack(withMeta);
      setReloadMsg(added > 0 ? `Added ${added} recipes` : 'Recipes are up to date');
    } catch (e) {
      setReloadMsg(`Reload failed: ${String(e)}`);
    } finally {
      setReloading(false);
    }
  }, [projectPath, loadRecipesFromPack]);

  const selectedRecipe = getSelectedRecipe();
  const recipeIssues = selectedRecipe ? validateRecipe(selectedRecipe) : [];
  const issues = issuesByPath(recipeIssues);
  const hasBlockingErrors = hasErrors(recipeIssues);

  // Re-render when lazy materialization makes more icons available.
  useEffect(() => {
    return subscribeMaterialized(() => setTextureTick((t) => t + 1));
  }, []);

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

  // Registry rows show the item's resolved icon (engine-rendered / runtime
  // captured) when available, else fall back to the local texture index.
  const getRegistryTextureUrl = useCallback((itemId: string): string | null => {
    return registryUrlById.get(itemId) ?? getTextureUrl(itemId)
  }, [registryUrlById, getTextureUrl]);

  const handleGridChange = useCallback((grid: (RecipeIngredient | null)[][]) => {
    const current = getSelectedRecipe();
    if (!current) return;
    if (current.type === 'shaped') {
      const { pattern, key } = gridToPattern(grid, current.key ?? {});
      updateRecipe(current.id, { pattern, key });
    } else if (current.type === 'shapeless') {
      updateRecipe(current.id, { ingredients: gridToIngredients(grid) });
    }
  }, [getSelectedRecipe, updateRecipe]);

  // The editor owns the 3×3 cell grid. For shaped recipes cells come from the
  // keyed pattern; for shapeless the ingredient list is laid out 3-wide.
  const gridCells = useMemo((): (RecipeIngredient | null)[][] => {
    if (!selectedRecipe) return [];
    if (selectedRecipe.type === 'shaped') {
      return patternToGrid(selectedRecipe.pattern ?? [], selectedRecipe.key ?? {});
    }
    if (selectedRecipe.type === 'shapeless') {
      return ingredientsToGrid(selectedRecipe.ingredients ?? []);
    }
    return [];
  }, [selectedRecipe]);

  const handleCellChange = useCallback((row: number, col: number, ing: RecipeIngredient | null) => {
    const next = gridCells.map(r => [...r]);
    if (row < next.length && col < next[row].length) next[row][col] = ing;
    handleGridChange(next);
  }, [gridCells, handleGridChange]);

  const handleSetCount = useCallback((row: number, col: number, count: number) => {
    const next = gridCells.map(r => [...r]);
    const cell = next[row]?.[col];
    if (cell) next[row][col] = { ...cell, count };
    handleGridChange(next);
  }, [gridCells, handleGridChange]);

  const handleSaveRecipes = () => {
    saveRecipes(recipes, markClean);
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

  // Item picker target: a grid cell or the output slot.
  const [pickTarget, setPickTarget] = useState<{ kind: 'cell'; row: number; col: number } | { kind: 'output' } | null>(null);

  const handlePickItem = useCallback((itemId: string) => {
    if (!selectedRecipe) return;
    if (pickTarget?.kind === 'cell') {
      handleCellChange(pickTarget.row, pickTarget.col, { item: itemId, count: 1, tag: false });
    } else if (pickTarget?.kind === 'output') {
      updateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, item: itemId } });
    }
    setPickTarget(null);
  }, [pickTarget, selectedRecipe, handleCellChange, updateRecipe]);

  return (
    <AnimationProvider animations={animations}>
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
          <button
            type="button"
            className={`script-toggle ${showScriptPreview ? 'active' : ''}`}
            onClick={toggleScriptPreview}
            title="Show the raw generated KubeJS/CraftTweaker script (opt-in)"
          >
            Script
          </button>
          <button className="btn-secondary" onClick={reloadRecipes} disabled={reloading} title="Re-scan the pack for recipes (cache-aware)">
            {reloading ? 'Reloading…' : 'Reload Recipes'}
          </button>
          {reloadMsg && <span className="search-loading">{reloadMsg}</span>}
          <button className="btn-secondary" onClick={() => setShowImport(true)}>Import JSON</button>
        </div>
      </header>

      <div className="recipe-editor-body">
        {indexLoading ? (
          <RecipeEditorSkeleton />
        ) : (
          <>
        <RecipePalette
          activeTab={activeSearchTab}
          items={registryFiltered}
          itemTotal={itemRegistry.length}
          tags={tagFiltered}
          tagTotal={tagCatalog.length}
          instancePath={projectPath}
          getTextureUrl={getRegistryTextureUrl}
          onDragStart={setDraggedItem}
        />

        <main className="recipe-canvas">
          <RecipeExplorer
            recipes={recipes}
            selectedRecipeId={selectedRecipeId}
            onSelectRecipe={selectRecipe}
            onNewRecipe={handleNewRecipe}
            onEditCopy={(id) => {
              const copyId = duplicateRecipe(id);
              if (copyId) selectRecipe(copyId);
            }}
            onToggleDisable={handleToggleDisable}
            getTextureUrl={getTextureUrl}
            isDisabled={isDisabled}
            manifestRecipes={manifestRecipes}
            itemRegistry={itemRegistry}
          />

          {selectedRecipe && (
            <CraftingGridPanel
              selectedRecipe={selectedRecipe}
              onTypeChange={(type) => updateRecipe(selectedRecipe.id, { type })}
              onUpdateRecipe={updateRecipe}
              cells={gridCells}
              instancePath={projectPath}
              getTextureUrl={getTextureUrl}
              onCellChange={handleCellChange}
              onSetCount={handleSetCount}
              onRequestPick={(row, col) => setPickTarget({ kind: 'cell', row, col })}
              onPickOutput={() => setPickTarget({ kind: 'output' })}
              onSave={handleSaveRecipes}
              onDelete={handleDeleteRecipe}
              onDuplicate={handleDuplicateRecipe}
              dirty={dirty}
              issues={issues}
              hasBlockingErrors={hasBlockingErrors}
            />
          )}
        </main>

        <aside className="recipe-detail">
          {showScriptPreview && projectId && (
            <RecipeScriptPreview
              projectId={projectId}
              recipes={recipes}
              loader={adapter.loader}
            />
          )}
          {draggedItem && (
            <div className="detail-card dragged-preview">
              <h4>Dragged Item</h4>
              <div className="detail-item">
                <img src={getTextureUrl(draggedItem.item) || ''} alt="" />
                <div>
                  <strong>{draggedItem.name}</strong>
                  <small>{draggedItem.item}</small>
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

      {pickTarget && (
        <ItemPickerModal
          items={itemRegistry}
          getTextureUrl={getTextureUrl}
          onSelect={handlePickItem}
          onClose={() => setPickTarget(null)}
        />
      )}

      {showSaveDialog && (
        <div className="save-toast">{saveMessage}</div>
      )}
    </div>
    </AnimationProvider>
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
