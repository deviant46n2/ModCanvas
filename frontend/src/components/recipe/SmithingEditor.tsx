import IngredientSlot from './IngredientSlot';
import { readSlot, writeSlot } from '../../core/recipe/specialized';
import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store';

interface SmithingEditorProps {
  recipe: Recipe;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  getTextureUrl: (itemId: string) => string | null;
}

export function SmithingEditor({ recipe, onUpdateRecipe, getTextureUrl }: SmithingEditorProps) {
  const update = (u: Partial<Recipe>) => onUpdateRecipe(recipe.id, u);

const setSlot = (slot: 'base' | 'addition', ing: RecipeIngredient | null) => {
    update({ ingredients: writeSlot(recipe, slot, ing) });
  };

  return (
    <div className="smithing-editor">
      <div className="smithing-slot-row">
        <IngredientSlot
          label="Base"
          value={readSlot(recipe, 'base')}
          getTextureUrl={getTextureUrl}
          onDrop={(ing) => setSlot('base', ing)}
          onChange={(ing) => setSlot('base', ing)}
        />
        <IngredientSlot
          label="Addition"
          value={readSlot(recipe, 'addition')}
          getTextureUrl={getTextureUrl}
          onDrop={(ing) => setSlot('addition', ing)}
          onChange={(ing) => setSlot('addition', ing)}
        />
      </div>
      <div className="smithing-output-row">
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

export default SmithingEditor;