import type { Recipe } from '../../core/recipe/recipe-store';

interface RecipeListProps {
  recipes: Recipe[];
  selectedRecipeId: string | null | undefined;
  onSelectRecipe: (id: string) => void;
  onNewRecipe: () => void;
  getTextureUrl: (itemId: string) => string | null;
}

export function RecipeList({
  recipes,
  selectedRecipeId,
  onSelectRecipe,
  onNewRecipe,
  getTextureUrl,
}: RecipeListProps) {
  return (
    <div className="recipe-list-panel">
      <div className="recipe-list-header">
        <h3>Recipes ({recipes.length})</h3>
        <button className="btn-primary" onClick={onNewRecipe}>+ New Recipe</button>
      </div>
      <div className="recipe-list">
        {recipes.map(recipe => (
          <div
            key={recipe.id}
            className={`recipe-list-item ${selectedRecipeId === recipe.id ? 'selected' : ''}`}
            onClick={() => onSelectRecipe(recipe.id)}
          >
            <div className="recipe-list-info">
              <span className="recipe-type-badge">{recipe.type}</span>
              <span className="recipe-name">{recipe.name}</span>
            </div>
            <div className="recipe-list-output">
              {recipe.output.item && (
                <>
                  {getTextureUrl(recipe.output.item) && (
                    <img src={getTextureUrl(recipe.output.item)!} alt="" className="recipe-output-icon" />
                  )}
                  <span>{recipe.output.item} ×{recipe.output.count}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecipeList;
