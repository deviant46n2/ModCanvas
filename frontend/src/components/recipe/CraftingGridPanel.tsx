import { RecipeGrid } from './CraftingGrid';
import { FurnaceEditor } from './FurnaceEditor';
import { StonecuttingEditor } from './StonecuttingEditor';
import { SmithingEditor } from './SmithingEditor';
import type { Recipe, RecipeIngredient, RecipeType } from '../../core/recipe/recipe-store';
import type { RecipeIssue } from '../../core/recipe/validation';

interface CraftingGridPanelProps {
  selectedRecipe: Recipe;
  onTypeChange: (type: RecipeType) => void;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  /** 3×3 cell grid owned by the editor (memoized `patternToGrid` for shaped,
   *  `ingredients` laid out 3-wide for shapeless). */
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
  issues?: Record<string, RecipeIssue[]>;
  hasBlockingErrors?: boolean;
}

export function CraftingGridPanel({
  selectedRecipe,
  onTypeChange,
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
  issues = {},
  hasBlockingErrors = false,
}: CraftingGridPanelProps) {
  const allIssues: RecipeIssue[] = Object.values(issues).reduce<RecipeIssue[]>(
    (acc, list) => acc.concat(list),
    [],
  );

  const isCrafting = selectedRecipe.type === 'shaped' || selectedRecipe.type === 'shapeless';

  return (
    <>
      <div className="crafting-grid-panel">
        <div className="crafting-grid-header">
          <select
            value={selectedRecipe.type}
            onChange={(e) => onTypeChange(e.target.value as RecipeType)}
            className="recipe-type-select"
          >
            <option value="shaped">Shaped</option>
            <option value="shapeless">Shapeless</option>
            <option value="smithing">Smithing</option>
            <option value="stonecutting">Stonecutting</option>
            <option value="smelting">Smelting</option>
            <option value="blasting">Blasting</option>
            <option value="smoking">Smoking</option>
            <option value="campfire">Campfire</option>
          </select>
          <input
            type="text"
            placeholder="Recipe group (optional)"
            value={selectedRecipe.group || ''}
            onChange={(e) => onUpdateRecipe(selectedRecipe.id, { group: e.target.value })}
            className="recipe-group-input"
          />
        </div>
        {isCrafting ? (
          <RecipeGrid
            cells={cells}
            shapeless={selectedRecipe.type === 'shapeless'}
            instancePath={instancePath}
            getTextureUrl={getTextureUrl}
            onCellChange={onCellChange}
            onSetCount={onSetCount}
            onRequestPick={onRequestPick}
            output={selectedRecipe.output}
            onPickOutput={onPickOutput}
            onOutputChange={(output) => onUpdateRecipe(selectedRecipe.id, { output })}
          />
        ) : selectedRecipe.type === 'smithing' ? (
          <SmithingEditor
            recipe={selectedRecipe}
            onUpdateRecipe={onUpdateRecipe}
            getTextureUrl={getTextureUrl}
          />
        ) : selectedRecipe.type === 'stonecutting' ? (
          <StonecuttingEditor
            recipe={selectedRecipe}
            onUpdateRecipe={onUpdateRecipe}
            getTextureUrl={getTextureUrl}
          />
        ) : (
          <FurnaceEditor
            recipe={selectedRecipe}
            onUpdateRecipe={onUpdateRecipe}
            getTextureUrl={getTextureUrl}
            issues={issues}
          />
        )}
      </div>
      {allIssues.length > 0 && (
        <div className={`recipe-issue-list ${hasBlockingErrors ? 'has-errors' : 'has-warnings'}`}>
          {allIssues.map((i, idx) => (
            <div key={idx} className={`recipe-issue recipe-issue-${i.severity}`}>
              {i.message}
            </div>
          ))}
        </div>
      )}
      <div className="recipe-actions">
        <button className="btn-secondary" onClick={onDuplicate}>Duplicate</button>
        <button className="btn-danger" onClick={onDelete}>Delete</button>
        <button className="btn-primary" onClick={onSave} disabled={!dirty || hasBlockingErrors}>
          {hasBlockingErrors ? 'Fix Errors to Save' : (dirty ? 'Save & Hot-Reload' : 'Saved')}
        </button>
      </div>
    </>
  );
}

export default CraftingGridPanel;
