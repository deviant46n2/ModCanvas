import { CraftingGrid } from './CraftingGrid';
import type { Recipe, RecipeIngredient, RecipeType } from '../../core/recipe/recipe-store';

interface CraftingGridPanelProps {
  selectedRecipe: Recipe;
  onTypeChange: (type: RecipeType) => void;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  onGridChange: (grid: (RecipeIngredient | null)[][]) => void;
  onSave: () => void;
  onDelete: () => void;
  getTextureUrl: (itemId: string) => string | null;
  getGridSize: () => 2 | 3;
  buildInitialGrid: () => (RecipeIngredient | null)[][] | undefined;
  dirty: boolean;
}

export function CraftingGridPanel({
  selectedRecipe,
  onTypeChange,
  onUpdateRecipe,
  onGridChange,
  onSave,
  onDelete,
  getTextureUrl,
  getGridSize,
  buildInitialGrid,
  dirty,
}: CraftingGridPanelProps) {
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
        <CraftingGrid
          size={getGridSize()}
          initialGrid={buildInitialGrid()}
          onChange={onGridChange}
        />
        <div className="output-section">
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
          </div>
        </div>
      </div>
      <div className="recipe-actions">
        <button className="btn-secondary" onClick={() => {}}>Duplicate</button>
        <button className="btn-danger" onClick={onDelete}>Delete</button>
        <button className="btn-primary" onClick={onSave} disabled={!dirty}>
          {dirty ? 'Save & Hot-Reload' : 'Saved'}
        </button>
      </div>
    </>
  );
}

export default CraftingGridPanel;
