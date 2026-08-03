import { CraftingGrid } from './CraftingGrid';
import { FurnaceEditor } from './FurnaceEditor';
import { StonecuttingEditor } from './StonecuttingEditor';
import { SmithingEditor } from './SmithingEditor';
import type { Recipe, RecipeIngredient, RecipeType } from '../../core/recipe/recipe-store';
import type { RecipeIssue } from '../../core/recipe/validation';

interface CraftingGridPanelProps {
  selectedRecipe: Recipe;
  onTypeChange: (type: RecipeType) => void;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  onGridChange: (grid: (RecipeIngredient | null)[][]) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  getTextureUrl: (itemId: string) => string | null;
  getGridSize: () => 2 | 3;
  buildInitialGrid: () => (RecipeIngredient | null)[][];
  dirty: boolean;
  issues?: Record<string, RecipeIssue[]>;
  hasBlockingErrors?: boolean;
}

export function CraftingGridPanel({
  selectedRecipe,
  onTypeChange,
  onUpdateRecipe,
  onGridChange,
  onSave,
  onDelete,
  onDuplicate,
  getTextureUrl,
  getGridSize,
  buildInitialGrid,
  dirty,
  issues = {},
  hasBlockingErrors = false,
}: CraftingGridPanelProps) {
  const allIssues: RecipeIssue[] = Object.values(issues).reduce<RecipeIssue[]>(
    (acc, list) => acc.concat(list),
    [],
  );
  const outputIssues = [
    ...(issues['output.item'] ?? []),
    ...(issues['output.count'] ?? []),
  ];

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
        {selectedRecipe.type === 'shaped' || selectedRecipe.type === 'shapeless' ? (
          <CraftingGrid
            size={getGridSize()}
            initialGrid={buildInitialGrid()}
            onChange={onGridChange}
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
        <div className={`output-section ${outputIssues.length ? 'has-issues' : ''}`}>
          <label>Output:</label>
          <div className="output-editor">
            {getTextureUrl(selectedRecipe.output.item) && (
              <img src={getTextureUrl(selectedRecipe.output.item)!} alt="" className="output-icon" />
            )}
            <input
              type="text"
              placeholder="Output item ID"
              value={selectedRecipe.output.item}
              onChange={(e) => onUpdateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, item: e.target.value } })}
            />
            <input
              type="number"
              min="1"
              max="64"
              value={selectedRecipe.output.count}
              onChange={(e) => onUpdateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, count: parseInt(e.target.value) || 1 } })}
              style={{ width: '60px' }}
            />
            {outputIssues.length > 0 && (
              <span className="recipe-field-issue" title={outputIssues.map((i) => i.message).join('\n')}>
                ⚠
              </span>
            )}
          </div>
        </div>
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