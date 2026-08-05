import { RecipeScriptDrawer } from './RecipeScriptDrawer';
import { CraftingGridPanel } from './CraftingGridPanel';
import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store';
import type { RecipeIssue } from '../../core/recipe/validation';

interface RecipeEditorCanvasProps {
  selectedRecipe: Recipe | null;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  cells: (RecipeIngredient | null)[][];
  instancePath: string;
  getTextureUrl: (itemId: string) => string | null;
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
  recipes: Recipe[];
  loader: string;
}

export function RecipeEditorCanvas({
  selectedRecipe,
  onUpdateRecipe,
  cells,
  instancePath,
  getTextureUrl,
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
  recipes,
  loader,
}: RecipeEditorCanvasProps) {
  return (
    <main className="recipe-canvas">
      {selectedRecipe && (
        <CraftingGridPanel
          selectedRecipe={selectedRecipe}
          onTypeChange={(type) => onUpdateRecipe(selectedRecipe.id, { type })}
          onUpdateRecipe={onUpdateRecipe}
          cells={cells}
          instancePath={instancePath}
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
        />
      )}

      {showScriptPreview && projectId && (
        <RecipeScriptDrawer
          projectId={projectId}
          recipes={recipes}
          selectedRecipe={selectedRecipe}
          loader={loader}
        />
      )}
    </main>
  );
}

export default RecipeEditorCanvas;
