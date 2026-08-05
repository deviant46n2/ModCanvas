import { Grid, type CellComponentProps } from 'react-window';
import type { Recipe } from '../../core/recipe/recipe-store';
import { EXPLORER_COLUMN_WIDTH, EXPLORER_ROW_HEIGHT, type RowStatus } from './recipe-explorer-utils';

type ExplorerCellData = {
  filtered: Recipe[];
  columns: number;
  selectedRecipeId: string | null | undefined;
  getTextureUrl: (itemId: string) => string | null;
  onSelectRecipe: (id: string) => void;
  onEditCopy: (id: string) => void;
  onToggleDisable: (recipe: Recipe) => void;
  statusOf: (r: Recipe) => RowStatus;
  isDisabled: (r: Recipe) => boolean;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
};

function ExplorerCell({ columnIndex, rowIndex, style, ...d }: CellComponentProps<ExplorerCellData>) {
  const flat = rowIndex * d.columns + columnIndex;
  const recipe = d.filtered[flat];
  if (!recipe) return <div style={style} />;
  const readOnly = recipe.editable === false;
  const status = d.statusOf(recipe);
  const disabled = d.isDisabled(recipe);
  return (
    <div
      style={style}
      key={recipe.id}
      className={`recipe-grid-item recipe-explorer-item ${d.selectedRecipeId === recipe.id ? 'selected' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={() => d.onSelectRecipe(recipe.id)}
      title={readOnly ? 'Read-only (from a mod jar)' : 'Click to open'}
    >
      <div className="recipe-grid-info">
        <input
          type="checkbox"
          className="recipe-select-checkbox"
          checked={d.selected.has(recipe.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => d.toggleSelect(recipe.id)}
          title="Multi-select for bulk actions"
        />
        <span className="recipe-type-badge">{recipe.type}</span>
        <span className="recipe-name">{recipe.name}</span>
        {readOnly ? (
          <span className="recipe-readonly-glyph" title="Read-only (from a mod jar)">⛃</span>
        ) : (
          <span className={`recipe-status recipe-status-${status === 'none' ? 'ok' : status}`}
            title={status === 'none' ? undefined : `Validation ${status}`} />
        )}
        <button
          type="button"
          className={`recipe-disable-toggle ${disabled ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); d.onToggleDisable(recipe); }}
          title={disabled ? 'Re-enable this recipe' : 'Disable this recipe'}
          aria-label={disabled ? 'Re-enable recipe' : 'Disable recipe'}
        />
      </div>
      <div className="recipe-grid-output">
        {recipe.output.item && (
          <>
            {d.getTextureUrl(recipe.output.item) && (
              <img src={d.getTextureUrl(recipe.output.item)!} alt="" className="recipe-output-icon" />
            )}
            <span>{recipe.output.item} ×{recipe.output.count}</span>
          </>
        )}
        {!readOnly && recipe.origin !== 'authored' && (
          <button
            type="button"
            className="recipe-edit-copy"
            onClick={(e) => { e.stopPropagation(); d.onEditCopy(recipe.id); }}
            title="Edit a copy (pack recipes are not persisted in place)"
          >
            Edit a copy
          </button>
        )}
        {disabled && <span className="recipe-disabled-chip">Disabled</span>}
      </div>
    </div>
  );
}

export function SectionGrid({ items, cellData, height }: {
  items: Recipe[];
  cellData: Omit<ExplorerCellData, 'filtered'>;
  height: number;
}) {
  if (items.length === 0 || height <= 0) return null;
  const columns = Math.max(1, Math.floor(cellData.columns / EXPLORER_COLUMN_WIDTH));
  const columnWidth = cellData.columns / columns;
  const rows = Math.ceil(items.length / columns);
  return (
    <Grid
      className="recipe-explorer-grid"
      style={{ width: cellData.columns, height }}
      cellComponent={ExplorerCell}
      columnCount={columns}
      columnWidth={columnWidth}
      rowCount={rows}
      rowHeight={EXPLORER_ROW_HEIGHT}
      cellProps={{ ...cellData, filtered: items, columns }}
      overscanCount={6}
    />
  );
}

export default SectionGrid;
