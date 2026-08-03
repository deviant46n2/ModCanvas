import IngredientSlot from './IngredientSlot';
import { readSlot, writeSlot } from '../../core/recipe/specialized';
import type { Recipe, RecipeIngredient } from '../../core/recipe/recipe-store';
import type { RecipeIssue } from '../../core/recipe/validation';

interface FurnaceEditorProps {
  recipe: Recipe;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  getTextureUrl: (itemId: string) => string | null;
  issues?: Record<string, RecipeIssue[]>;
}

export function FurnaceEditor({ recipe, onUpdateRecipe, getTextureUrl, issues = {} }: FurnaceEditorProps) {
  const update = (u: Partial<Recipe>) => onUpdateRecipe(recipe.id, u);
  const inputIssues = (issues['ingredients.0'] ?? []).map((i) => i.message).join('\n');

  const setInput = (ing: RecipeIngredient | null) => {
    update({ ingredients: writeSlot(recipe, 'input', ing) });
  };

  return (
    <div className="furnace-editor">
      <div className="specialized-input-row">
        <IngredientSlot
          label="Input"
          value={readSlot(recipe, 'input')}
          getTextureUrl={getTextureUrl}
          onDrop={setInput}
          onChange={setInput}
        />
        <span className="specialized-arrow">→</span>
        <div className={`output-section ${inputIssues ? 'has-issues' : ''}`}>
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

      <div className="furnace-params">
        <label className="param-field">
          <span>Experience</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={recipe.experience ?? 0.35}
            onChange={(e) => update({ experience: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="param-field">
          <span>Cooking time (ticks)</span>
          <input
            type="number"
            min="1"
            value={recipe.cookingTime ?? 200}
            onChange={(e) => update({ cookingTime: parseInt(e.target.value) || 200 })}
          />
        </label>
      </div>
    </div>
  );
}

export default FurnaceEditor;