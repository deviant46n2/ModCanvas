import { RecipeExplorer } from './RecipeExplorer';
import { RecipeEditorSkeleton } from './RecipeEditorSkeleton';
import { RecipeEditorCanvas } from './RecipeEditorCanvas';
import { RecipePalette } from './RecipePalette';
import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store';
import type { RecipeIssue } from '../../core/recipe/validation';
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api';

interface RecipeEditorBodyProps {
  indexLoading: boolean;
  recipes: Recipe[];
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string) => void;
  onNewRecipe: () => void;
  onEditCopy: (id: string) => void;
  onToggleDisable: (recipe: Recipe) => void;
  explorerQuery: string;
  onQueryChange: (q: string) => void;
  onBulkReplace: (ids: string[]) => void;
  getTextureUrl: (itemId: string) => string | null;
  isDisabled: (r: Recipe) => boolean;
  manifestRecipes: Recipe[];
  itemRegistry: ItemRegistryEntry[];
  selectedRecipe: Recipe | null;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  gridCells: (RecipeIngredient | null)[][];
  projectPath: string;
  onCellChange: (row: number, col: number, ing: RecipeIngredient | null) => void;
  onSetCount: (row: number, col: number, count: number) => void;
  onRequestPick: (row: number, col: number) => void;
  onPickOutput: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  dirty: boolean;
  issues: Record<string, RecipeIssue[]>;
  hasBlockingErrors: boolean;
  showScriptPreview: boolean;
  projectId: string;
  loader: string;
  tagCatalog: ItemTagInfo[];
  getRegistryTextureUrl: (itemId: string) => string | null;
  onShowRecipesUsing: (itemOrTagId: string) => void;
}

export function RecipeEditorBody({
  indexLoading,
  recipes,
  selectedRecipeId,
  onSelectRecipe,
  onNewRecipe,
  onEditCopy,
  onToggleDisable,
  explorerQuery,
  onQueryChange,
  onBulkReplace,
  getTextureUrl,
  isDisabled,
  manifestRecipes,
  itemRegistry,
  selectedRecipe,
  onUpdateRecipe,
  gridCells,
  projectPath,
  onCellChange,
  onSetCount,
  onRequestPick,
  onPickOutput,
  onSave,
  onDelete,
  onDuplicate,
  dirty,
  issues,
  hasBlockingErrors,
  showScriptPreview,
  projectId,
  loader,
  tagCatalog,
  getRegistryTextureUrl,
  onShowRecipesUsing,
}: RecipeEditorBodyProps) {
  return (
    <div className="recipe-editor-body">
      {indexLoading ? (
        <RecipeEditorSkeleton />
      ) : (
        <>
      <RecipeExplorer
        recipes={recipes}
        selectedRecipeId={selectedRecipeId}
        onSelectRecipe={onSelectRecipe}
        onNewRecipe={onNewRecipe}
        onEditCopy={onEditCopy}
        onToggleDisable={onToggleDisable}
        query={explorerQuery}
        onQueryChange={onQueryChange}
        onBulkReplace={onBulkReplace}
        getTextureUrl={getTextureUrl}
        isDisabled={isDisabled}
        manifestRecipes={manifestRecipes}
        itemRegistry={itemRegistry}
      />

      <RecipeEditorCanvas
        selectedRecipe={selectedRecipe}
        onUpdateRecipe={onUpdateRecipe}
        cells={gridCells}
        instancePath={projectPath}
        getTextureUrl={getTextureUrl}
        onCellChange={onCellChange}
        onSetCount={onSetCount}
        onRequestPick={onRequestPick}
        onPickOutput={onPickOutput}
        onSave={onSave}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dirty={dirty}
        issues={issues}
        hasBlockingErrors={hasBlockingErrors}
        showScriptPreview={showScriptPreview}
        projectId={projectId}
        recipes={recipes}
        loader={loader}
      />

      <RecipePalette
        items={itemRegistry}
        tags={tagCatalog}
        instancePath={projectPath}
        getTextureUrl={getRegistryTextureUrl}
        onShowRecipesUsing={onShowRecipesUsing}
      />
      </>
        )}
    </div>
  );
}

export default RecipeEditorBody;
