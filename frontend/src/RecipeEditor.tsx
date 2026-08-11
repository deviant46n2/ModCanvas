import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRecipeStore } from './core/recipe/recipe-store';
import { RecipeEditorHeader } from './components/recipe/RecipeEditorHeader';
import { RecipeEditorBody } from './components/recipe/RecipeEditorBody';
import { RecipeEditorModals } from './components/recipe/RecipeEditorModals';
import type { IngredientRef } from './core/recipe/bulk-replace';
import type { ImportedRecipe } from './core/recipe/json-import';
import { useInstanceTextures } from './hooks/useInstanceTextures';
import { useRecipeSave } from './hooks/useRecipeSave';
import { useRecipeDisable, manifestRecipesFrom } from './hooks/useRecipeDisable';
import { usePackHealthStore } from './core/pack-health/pack-health-store';
import type { ItemRegistryEntry, ItemTagInfo } from './services/api';
import { getAdapter } from './adapters';
import { normalizeLoader } from './core/recipe/loader';
import { validateRecipe, hasErrors, issuesByPath } from './core/recipe/validation';
import { subscribeMaterialized } from './services/texture-loader';
import { AnimationProvider } from './components/quest/animation-context';
import type { RecipeIngredient } from './core/recipe/recipe-store';
import {
  readScriptPreviewPref,
  writeScriptPreviewPref,
  buildRegistryUrlMap,
  makeTextureUrlGetter,
  createNewRecipe,
  recipeFromImported,
  buildGridCells,
  applyCellEdit,
  applyCellCount,
  applyGridToRecipe,
  applyBulkReplace,
  createToggleDisableHandler,
  createRecipesUsingHandler,
  reloadPackRecipes,
  scanItemRegistry,
} from './components/recipe/recipe-editor-utils';
import './recipe-editor-styles';

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

  // Explorer owns recipe search (lifted here so "recipes using this" can drive
  // it). The palette owns its own item/tag search internally.
  const [explorerQuery, setExplorerQuery] = useState('');

  const { textureIndex, animations, loading: indexLoading } = useInstanceTextures(projectPath);
  const { showSaveDialog, saveMessage, save: saveRecipes } = useRecipeSave(projectId, recipeScriptPath);
  const { toggleDisable } = useRecipeDisable(projectId);
  const manifestRecipes = useMemo(() => manifestRecipesFrom(disabledScripts), [disabledScripts]);

  const handleToggleDisable = createToggleDisableHandler(toggleDisable);
  // Instance item registry + local tag catalog back the two palette tabs. The
  // quest editor may already have scanned this instance; only scan here when
  // the store is empty so the two editors share one scan.
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry) ?? ([] as ItemRegistryEntry[]);
  const setItemRegistry = usePackHealthStore((s) => s.setItemRegistry);
  const [tagCatalog, setTagCatalog] = useState<ItemTagInfo[]>([]);
  const registryUrlById = useMemo(() => buildRegistryUrlMap(itemRegistry), [itemRegistry]);
  const [, setTextureTick] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState('');
  // The raw generated-script preview is opt-in for veterans — hidden by default
  // so beginners never hit code. Sticky across sessions via localStorage.
  const [showScriptPreview, setShowScriptPreview] = useState(readScriptPreviewPref);
  const toggleScriptPreview = () => {
    setShowScriptPreview((prev) => {
      const next = !prev;
      writeScriptPreviewPref(next);
      return next;
    });
  };

  useEffect(() => {
    let disposed = false;
    scanItemRegistry(projectPath, kubejsNamespace)
      .then(({ registry, tags }) => {
        if (disposed) return;
        setTagCatalog(tags);
        if (usePackHealthStore.getState().itemRegistry === null) {
          setItemRegistry(registry);
        }
      })
      .catch((e) => console.error('[RecipeEditor] Failed to load item registry:', e));
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
      setReloadMsg(await reloadPackRecipes(projectPath, loadRecipesFromPack));
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

  const getTextureUrl = makeTextureUrlGetter(textureIndex, projectPath);

  // Registry rows show the item's resolved icon (engine-rendered / runtime
  // captured) when available, else fall back to the local texture index.
  const getRegistryTextureUrl = useCallback((itemId: string): string | null => {
    return registryUrlById.get(itemId) ?? getTextureUrl(itemId)
  }, [registryUrlById, getTextureUrl]);

  // "recipes using this" drives the explorer search: `>item` / `#tag`.
  const handleShowRecipesUsing = createRecipesUsingHandler(setExplorerQuery);
  const [bulkReplaceIds, setBulkReplaceIds] = useState<string[] | null>(null);

  const handleBulkReplace = useCallback((from: IngredientRef, to: IngredientRef, affectedIds: string[]) => {
    applyBulkReplace(useRecipeStore.getState().recipes, affectedIds, from, to, updateRecipe);
    setBulkReplaceIds(null);
  }, [updateRecipe]);
  const handleGridChange = useCallback((grid: (RecipeIngredient | null)[][]) => {
    const current = getSelectedRecipe();
    if (!current) return;
    const updates = applyGridToRecipe(current, grid);
    if (updates) updateRecipe(current.id, updates);
  }, [getSelectedRecipe, updateRecipe]);
  // The editor owns the 3×3 cell grid. For shaped recipes cells come from the
  // keyed pattern; for shapeless the ingredient list is laid out 3-wide.
  const gridCells = useMemo(
    (): (RecipeIngredient | null)[][] => buildGridCells(selectedRecipe),
    [selectedRecipe],
  );
  const handleCellChange = useCallback((row: number, col: number, ing: RecipeIngredient | null) => {
    handleGridChange(applyCellEdit(gridCells, row, col, ing));
  }, [gridCells, handleGridChange]);
  const handleSetCount = useCallback((row: number, col: number, count: number) => {
    handleGridChange(applyCellCount(gridCells, row, col, count));
  }, [gridCells, handleGridChange]);
  const handleSaveRecipes = () => {
    saveRecipes(recipes, markClean);
  };

  const handleNewRecipe = () => {
    const id = addRecipe(createNewRecipe());
    selectRecipe(id);
  };

  const handleImport = (imported: ImportedRecipe[]) => {
    let lastId: string | null = null;
    for (const entry of imported) {
      const { recipe, warnings } = entry;
      // eslint-disable-next-line no-console
      if (warnings.length) console.warn('Import warnings:', recipe.name, warnings);
      lastId = addRecipe(recipeFromImported(entry));
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

  const handlePickItem = useCallback((value: { item: string; tag: boolean }) => {
    if (!selectedRecipe) return;
    if (pickTarget?.kind === 'cell') {
      handleCellChange(pickTarget.row, pickTarget.col, { item: value.item, count: 1, tag: value.tag });
    } else if (pickTarget?.kind === 'output') {
      // The output slot is always a concrete item, never a tag.
      updateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, item: value.item } });
    }
    setPickTarget(null);
  }, [pickTarget, selectedRecipe, handleCellChange, updateRecipe]);

  return (
    <AnimationProvider animations={animations}>
    <div className="recipe-editor">
      <RecipeEditorHeader
        mcVersion={adapter.mcVersion}
        loader={adapter.loader}
        showScriptPreview={showScriptPreview}
        onToggleScriptPreview={toggleScriptPreview}
        reloading={reloading}
        reloadMsg={reloadMsg}
        onReload={reloadRecipes}
        onImport={() => setShowImport(true)}
      />

      <RecipeEditorBody
        indexLoading={indexLoading}
        recipes={recipes}
        selectedRecipeId={selectedRecipeId}
        onSelectRecipe={selectRecipe}
        onNewRecipe={handleNewRecipe}
        onEditCopy={(id) => {
          const copyId = duplicateRecipe(id);
          if (copyId) selectRecipe(copyId);
        }}
        onToggleDisable={handleToggleDisable}
        explorerQuery={explorerQuery}
        onQueryChange={setExplorerQuery}
        onBulkReplace={setBulkReplaceIds}
        getTextureUrl={getTextureUrl}
        isDisabled={isDisabled}
        manifestRecipes={manifestRecipes}
        itemRegistry={itemRegistry}
        selectedRecipe={selectedRecipe}
        onUpdateRecipe={updateRecipe}
        gridCells={gridCells}
        projectPath={projectPath}
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
        showScriptPreview={showScriptPreview}
        projectId={projectId}
        loader={adapter.loader}
        tagCatalog={tagCatalog}
        getRegistryTextureUrl={getRegistryTextureUrl}
        onShowRecipesUsing={handleShowRecipesUsing}
      />

      <RecipeEditorModals
        showImport={showImport}
        onCloseImport={() => setShowImport(false)}
        onImport={handleImport}
        pickTarget={pickTarget}
        onPickItem={handlePickItem}
        onClosePick={() => setPickTarget(null)}
        bulkReplaceIds={bulkReplaceIds}
        recipes={recipes}
        itemRegistry={itemRegistry}
        tags={tagCatalog}
        getTextureUrl={getTextureUrl}
        onCloseBulk={() => setBulkReplaceIds(null)}
        onApplyBulk={handleBulkReplace}
      />

      {showSaveDialog && (
        <div className="save-toast">{saveMessage}</div>
      )}
    </div>
    </AnimationProvider>
  );
}

export default RecipeEditor;
