import { useMemo, useState } from 'react';
import type { Recipe, RecipeType } from '../../core/recipe/recipe-store';
import { validateRecipe, hasErrors } from '../../core/recipe/validation';

interface RecipeListProps {
  recipes: Recipe[];
  selectedRecipeId: string | null | undefined;
  onSelectRecipe: (id: string) => void;
  onNewRecipe: () => void;
  getTextureUrl: (itemId: string) => string | null;
  onRename: (id: string, name: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onReorder: (from: number, to: number) => void;
}

const ALL_TYPES = 'all';
const TYPE_OPTIONS: (RecipeType | typeof ALL_TYPES)[] = [
  ALL_TYPES, 'shaped', 'shapeless', 'smithing', 'stonecutting',
  'smelting', 'blasting', 'smoking', 'campfire',
];

function matchesFilter(recipe: Recipe, query: string, type: RecipeType | typeof ALL_TYPES): boolean {
  if (type !== ALL_TYPES && recipe.type !== type) return false;
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (recipe.name.toLowerCase().includes(q)) return true;
  if (recipe.output.item && recipe.output.item.toLowerCase().includes(q)) return true;
  if (recipe.group && recipe.group.toLowerCase().includes(q)) return true;
  if (recipe.type.toLowerCase().includes(q)) return true;
  const ings = recipe.ingredients ?? Object.values(recipe.key ?? {});
  return ings.some((ing) => ing?.item && ing.item.toLowerCase().includes(q));
}

type Status = 'valid' | 'error' | 'warning';

function statusOf(recipe: Recipe): Status {
  const issues = validateRecipe(recipe);
  if (hasErrors(issues)) return 'error';
  if (issues.length > 0) return 'warning';
  return 'valid';
}

export function RecipeList({
  recipes,
  selectedRecipeId,
  onSelectRecipe,
  onNewRecipe,
  getTextureUrl,
  onRename,
  onBulkDelete,
  onReorder,
}: RecipeListProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RecipeType | typeof ALL_TYPES>(ALL_TYPES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => recipes.filter((r) => matchesFilter(r, query, typeFilter)),
    [recipes, query, typeFilter],
  );

  const selectable = filtered.length > 1;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const finishRename = (id: string) => {
    const name = draft.trim();
    if (name && name !== recipes.find((r) => r.id === id)?.name) {
      onRename(id, name);
    }
    setEditingId(null);
  };

  const onDragStart = (index: number) => setDragIndex(index);
  const onDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); return; }
    onReorder(dragIndex, index);
    setDragIndex(null);
  };

  return (
    <div className="recipe-list-panel">
      <div className="recipe-list-header">
        <h3>Recipes ({recipes.length})</h3>
        <div className="header-actions">
          {selected.size > 0 && (
            <button className="btn-danger" onClick={() => { onBulkDelete([...selected]); setSelected(new Set()); }}>
              Delete ({selected.size})
            </button>
          )}
          <button className="btn-primary" onClick={onNewRecipe}>+ New Recipe</button>
        </div>
      </div>
      <div className="recipe-list-filters">
        <input
          type="text"
          placeholder="Search recipes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="recipe-list-search"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RecipeType | typeof ALL_TYPES)}>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t === ALL_TYPES ? 'All types' : t}</option>)}
        </select>
      </div>
      <div className="recipe-list">
        {filtered.length === 0 ? (
          <div className="empty-state">No recipes match your filters.</div>
        ) : (
          filtered.map((recipe, index) => (
            <div
              key={recipe.id}
              className={`recipe-list-item ${selectedRecipeId === recipe.id ? 'selected' : ''} ${selected.has(recipe.id) ? 'bulk-selected' : ''}`}
              onClick={() => onSelectRecipe(recipe.id)}
              draggable={selectable}
              onDragStart={(e) => { e.stopPropagation(); onDragStart(index); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); onDrop(index); }}
            >
              <div className="recipe-list-info">
                {selectable && (
                  <input
                    type="checkbox"
                    className="recipe-select-checkbox"
                    checked={selected.has(recipe.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(recipe.id)}
                  />
                )}
                <span className="recipe-type-badge">{recipe.type}</span>
                {editingId === recipe.id ? (
                  <input
                    className="recipe-rename-input"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finishRename(recipe.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename(recipe.id);
                      if (e.key === 'Escape') setEditingId(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="recipe-name"
                    title="Double-click to rename"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(recipe.id); setDraft(recipe.name); }}
                  >
                    {recipe.name}
                  </span>
                )}
                <span className={`recipe-status recipe-status-${statusOf(recipe)}`} title={statusOf(recipe)} />
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
          ))
        )}
      </div>
    </div>
  );
}

export default RecipeList;