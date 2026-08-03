import IngredientSlot from './IngredientSlot';
import { readSlot, writeSlot } from '../../core/recipe/specialized';
import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store';

interface StonecuttingEditorProps {
  recipe: Recipe;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  getTextureUrl: (itemId: string) => string | null;
}

export function StonecuttingEditor({ recipe, onUpdateRecipe, getTextureUrl }: StonecuttingEditorProps) {
  const update = (u: Partial<Recipe>) => onUpdateRecipe(recipe.id, u);

  const setInput = (ing: RecipeIngredient | null) => {
    update({ ingredients: writeSlot(recipe, 'input', ing) });
  };

  return (
    <div className="stonecutting-editor">
      <div className="specialized-input-row">
        <IngredientSlot
          label="Input"
          value={readSlot(recipe, 'input')}
          getTextureUrl={getTextureUrl}
          onDrop={setInput}
          onChange={setInput}
        />
        <span className="specialized-arrow">→</span>
        <div className="output-section">
          <label className="specialized-output-label">Output</label>
          <div className="output-editor">
            {getTextureUrl(recipe.output.item) && (
              <img src={getTextureUrl(recipe.output.item)!} alt="" className="output-icon" />
            )}
            <input
              type="text"
              placeholder="Output item ID"
              value={recipe.output.item}
              onChange={(e) => update({ output: { ...recipe.output, item: e.target.value } })}
            />
            <input
              type="number"
              min="1"
              max="64"
              value={recipe.output.count}
              onChange={(e) => update({ output: { ...recipe.output, count: parseInt(e.target.value) || 1 } })}
              style={{ width: '60px' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StonecuttingEditor;