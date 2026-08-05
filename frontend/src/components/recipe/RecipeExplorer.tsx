import { useMemo, useState, useEffect, useRef } from 'react';
import { Grid, type CellComponentProps } from 'react-window';
import type { Recipe } from '../../core/recipe/recipe-store';
import {
  matchesFilter,
  groupByProvenance,
  type FilterState,
  type OwnershipFilter,
  type StatusFilter,
  type RecipeTypeFilter,
  type FilterDeps,
} from '../../core/recipe/filter';
import type { ItemRegistryEntry } from '../../services/quest-types';
import { getTagItems } from '../../services/smart-filter-tags';
import { validateRecipe } from '../../core/recipe/validation';

const TYPE_OPTIONS: RecipeTypeFilter[] = [
  'all', 'shaped', 'shapeless', 'smithing', 'stonecutting',
  'smelting', 'blasting', 'smoking', 'campfire',
];
const OWNERSHIP_OPTIONS: OwnershipFilter[] = ['all', 'mine', 'pack', 'jars'];
const STATUS_OPTIONS: StatusFilter[] = ['all', 'enabled', 'disabled'];

const COLUMN_WIDTH = 260;
const GRID_ROW_HEIGHT = 52;
const MINE_MAX_H = 260;
const PACK_MAX_H = 400;
const JARS_MAX_H = 320;

export interface RecipeExplorerProps {
  recipes: Recipe[];
  selectedRecipeId: string | null | undefined;
  onSelectRecipe: (id: string) => void;
  onNewRecipe: () => void;
  onEditCopy: (id: string) => void;
  onToggleDisable: (recipe: Recipe) => void;
  /** Controlled search query (lifted so "recipes using this" can drive it). */
  query: string;
  onQueryChange: (q: string) => void;
  getTextureUrl: (itemId: string) => string | null;
  isDisabled: (r: Recipe) => boolean;
  /** Comment-out manifest pseudo-recipes, shown in the Disabled filter. */
  manifestRecipes: Recipe[];
  itemRegistry: ItemRegistryEntry[];
}

type RowStatus = 'error' | 'warning' | 'ok' | 'none';

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

function SectionGrid({ items, cellData, maxHeight }: {
  items: Recipe[];
  cellData: Omit<ExplorerCellData, 'filtered'>;
  maxHeight: number;
}) {
  if (items.length === 0) return null;
  const columns = Math.max(1, Math.floor(cellData.columns / COLUMN_WIDTH));
  const columnWidth = cellData.columns / columns;
  const rows = Math.ceil(items.length / columns);
  const height = Math.min(rows * GRID_ROW_HEIGHT, maxHeight);
  return (
    <Grid
      className="recipe-explorer-grid"
      style={{ width: cellData.columns, height }}
      cellComponent={ExplorerCell}
      columnCount={columns}
      columnWidth={columnWidth}
      rowCount={rows}
      rowHeight={GRID_ROW_HEIGHT}
      cellProps={{ ...cellData, filtered: items, columns }}
      overscanCount={6}
    />
  );
}

export function RecipeExplorer({
  recipes,
  selectedRecipeId,
  onSelectRecipe,
  onNewRecipe,
  onEditCopy,
  onToggleDisable,
  query,
  onQueryChange,
  getTextureUrl,
  isDisabled,
  manifestRecipes,
  itemRegistry,
}: RecipeExplorerProps) {
  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [attention, setAttention] = useState(false);
  const [changed, setChanged] = useState(false);
  const [type, setType] = useState<RecipeTypeFilter>('all');
  const [jarsCollapsed, setJarsCollapsed] = useState(true);

  // Validation status memoized over authored recipes only; read-only rows are
  // skipped entirely (neutral lock glyph, no validation cost).
  const issuesMap = useMemo(() => {
    const map = new Map<string, { hasError: boolean; hasWarning: boolean }>();
    for (const r of recipes) {
      if (r.origin !== 'authored') continue;
      const issues = validateRecipe(r);
      map.set(r.id, {
        hasError: issues.some((i) => i.severity === 'error'),
        hasWarning: issues.some((i) => i.severity === 'warning'),
      });
    }
    return map;
  }, [recipes]);

  const hasIssues = useMemo(() => (r: Recipe) => {
    const i = issuesMap.get(r.id);
    return !!i && (i.hasError || i.hasWarning);
  }, [issuesMap]);

  const modItemIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of itemRegistry) {
      let set = map.get(item.mod_id);
      if (!set) { set = new Set(); map.set(item.mod_id, set); }
      set.add(item.id);
    }
    return (mod: string) => map.get(mod) ?? new Set<string>();
  }, [itemRegistry]);

  const getTagMembers = useMemo(() => (tag: string) => getTagItems(tag) ?? [], []);

  // When the Disabled filter is active, merge in the comment-out manifest's
  // pseudo-recipes (calls commented out of scripts are gone from the pack scan
  // but must stay visible + re-enable-able), skipping any already represented.
  const merged = useMemo(() => {
    if (status !== 'disabled') return recipes;
    const seen = new Set<string>();
    for (const r of recipes) {
      if (r.source && r.sourceLines) seen.add(`${r.source}:${r.sourceLines.start}`);
    }
    const extras = manifestRecipes.filter(
      (m) => m.source && m.sourceLines && !seen.has(`${m.source}:${m.sourceLines.start}`)
    );
    return [...recipes, ...extras];
  }, [recipes, manifestRecipes, status]);

  const filtered = useMemo(() => {
    const state: FilterState = { query, ownership, status, attention, changed, type };
    const d: FilterDeps = { isDisabled, getTagMembers, modItemIds, hasIssues };
    return merged.filter((r) => matchesFilter(r, state, d));
  }, [merged, query, ownership, status, attention, changed, type, isDisabled, getTagMembers, modItemIds, hasIssues]);

  const { mine, pack, jars } = useMemo(() => groupByProvenance(filtered), [filtered]);

  const showAll = ownership === 'all';
  const showMine = showAll || ownership === 'mine';
  const showPack = showAll || ownership === 'pack';
  const showJars = showAll || ownership === 'jars';

  // Measure the panel so the virtualized grids fill its width.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelW, setPanelW] = useState(600);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setPanelW(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cellBase = {
    columns: panelW,
    selectedRecipeId,
    getTextureUrl,
    onSelectRecipe,
    onEditCopy,
    onToggleDisable,
    statusOf: (r: Recipe): RowStatus => {
      if (r.editable === false || r.origin !== 'authored') return 'none';
      const i = issuesMap.get(r.id);
      if (!i) return 'ok';
      if (i.hasError) return 'error';
      if (i.hasWarning) return 'warning';
      return 'ok';
    },
    isDisabled,
  };

  const noRecipesAtAll = recipes.length === 0;
  const nothingMatches = !noRecipesAtAll && filtered.length === 0;

  return (
    <div className="recipe-list-panel recipe-explorer" ref={panelRef}>
      <div className="recipe-list-header">
        <h3>Recipes ({recipes.length})</h3>
        <button className="btn-primary" onClick={onNewRecipe}>+ New Recipe</button>
      </div>

      <div className="recipe-explorer-filters">
        <div className="segmented-row">
          {OWNERSHIP_OPTIONS.map((o) => (
            <button key={o} className={ownership === o ? 'active' : ''} onClick={() => setOwnership(o)}>
              {o === 'all' ? 'All' : o === 'mine' ? 'Mine' : o === 'pack' ? 'Pack' : 'Jars'}
            </button>
          ))}
        </div>
        <div className="segmented-row">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : s === 'enabled' ? 'Enabled' : 'Disabled'}
            </button>
          ))}
        </div>
        <div className="chip-row">
          <label className={`chip ${attention ? 'active' : ''}`}>
            <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
            Needs attention
          </label>
          <label className={`chip ${changed ? 'active' : ''}`}>
            <input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} />
            Changed
          </label>
        </div>
        <div className="recipe-explorer-search-row">
          <input
            type="text"
            placeholder="Search…  @mod  #tag  >output  <input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="recipe-list-search"
          />
          <select value={type} onChange={(e) => setType(e.target.value as RecipeTypeFilter)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="recipe-explorer-groups">
        {noRecipesAtAll && (
          <div className="empty-state">
            No recipes yet — start one
            <div className="empty-hints">+ New Recipe · Copy a recipe · Import JSON</div>
          </div>
        )}
        {nothingMatches && (
          <div className="empty-state">No recipes match your filters.</div>
        )}
        {showMine && mine.length > 0 && (
          <section className="recipe-group">
            <h4 className="recipe-group-title">Mine <span>{mine.length}</span></h4>
            <SectionGrid items={mine} cellData={cellBase} maxHeight={MINE_MAX_H} />
          </section>
        )}
        {showPack && pack.length > 0 && (
          <section className="recipe-group">
            <h4 className="recipe-group-title">Pack <span>{pack.length}</span></h4>
            <SectionGrid items={pack} cellData={cellBase} maxHeight={PACK_MAX_H} />
          </section>
        )}
        {showJars && (
          <section className="recipe-group recipe-group-jars">
            <h4 className="recipe-group-title recipe-group-toggle" onClick={() => setJarsCollapsed((c) => !c)}>
              <span className="recipe-group-caret">{jarsCollapsed ? '▸' : '▾'}</span>
              Jars <span>{jars.length}</span>
            </h4>
            {!jarsCollapsed && (
              <SectionGrid items={jars} cellData={cellBase} maxHeight={JARS_MAX_H} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default RecipeExplorer;
