import { useMemo, useState, useEffect, useRef } from 'react';
import type { Recipe } from '../../core/recipe/recipe-store';
import {
  matchesFilter,
  groupByProvenance,
  type FilterState,
  type FilterDeps,
} from '../../core/recipe/filter';
import type { OwnershipFilter, StatusFilter, RecipeTypeFilter } from '../../core/recipe/filter';
import type { ItemRegistryEntry } from '../../services/quest-types';
import { SectionGrid } from './explorer-grid';
import {
  buildIssuesMap,
  buildModItemLookup,
  getTagMembers,
  mergeManifestRecipes,
  rowStatusOf,
  computeGridLayout,
} from './recipe-explorer-utils';

const TYPE_OPTIONS: RecipeTypeFilter[] = [
  'all', 'shaped', 'shapeless', 'smithing', 'stonecutting',
  'smelting', 'blasting', 'smoking', 'campfire',
];
const OWNERSHIP_OPTIONS: OwnershipFilter[] = ['all', 'mine', 'pack', 'jars'];
const STATUS_OPTIONS: StatusFilter[] = ['all', 'enabled', 'disabled'];

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
  /** Open the bulk-replace modal for the multi-selected recipe ids. */
  onBulkReplace: (ids: string[]) => void;
  getTextureUrl: (itemId: string) => string | null;
  isDisabled: (r: Recipe) => boolean;
  /** Comment-out manifest pseudo-recipes, shown in the Disabled filter. */
  manifestRecipes: Recipe[];
  itemRegistry: ItemRegistryEntry[];
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
  onBulkReplace,
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Validation status memoized over authored recipes only; read-only rows are
  // skipped entirely (neutral lock glyph, no validation cost).
  const issuesMap = useMemo(() => buildIssuesMap(recipes), [recipes]);

  const hasIssues = useMemo(() => (r: Recipe) => {
    const i = issuesMap.get(r.id);
    return !!i && (i.hasError || i.hasWarning);
  }, [issuesMap]);

  const modItemIds = useMemo(() => buildModItemLookup(itemRegistry), [itemRegistry]);

  // When the Disabled filter is active, merge in the comment-out manifest's
  // pseudo-recipes (calls commented out of scripts are gone from the pack scan
  // but must stay visible + re-enable-able), skipping any already represented.
  const merged = useMemo(
    () => (status !== 'disabled' ? recipes : mergeManifestRecipes(recipes, manifestRecipes)),
    [recipes, manifestRecipes, status]
  );

  const filtered = useMemo(() => {
    const state: FilterState = { query, ownership, status, attention, changed, type };
    const d: FilterDeps = { isDisabled, getTagMembers, modItemIds, hasIssues };
    return merged.filter((r) => matchesFilter(r, state, d));
  }, [merged, query, ownership, status, attention, changed, type, isDisabled, modItemIds, hasIssues]);

  const { mine, pack, jars } = useMemo(() => groupByProvenance(filtered), [filtered]);

  const showAll = ownership === 'all';
  const showMine = showAll || ownership === 'mine';
  const showPack = showAll || ownership === 'pack';
  const showJars = showAll || ownership === 'jars';

  // Measure the panel so the virtualized grids fill its width, and the groups
  // area so the list can expand to fill the panel height.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelW, setPanelW] = useState(600);
  const groupsRef = useRef<HTMLDivElement>(null);
  const [groupsH, setGroupsH] = useState(400);
  useEffect(() => {
    const panel = panelRef.current;
    const groups = groupsRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === panel) setPanelW(entry.contentRect.width);
        else setGroupsH(entry.contentRect.height);
      }
    });
    if (panel) ro.observe(panel);
    if (groups) ro.observe(groups);
    return () => ro.disconnect();
  }, []);

  // Per-section heights: natural (capped), then give the leftover panel height
  // to the last rendered grid so the list fills instead of leaving an empty
  // lower half.
  const { mineH, packH, jarsH, mineGrid, packGrid } = computeGridLayout({
    panelW,
    groupsH,
    mineCount: mine.length,
    packCount: pack.length,
    jarsCount: jars.length,
    showMine,
    showPack,
    showJars,
    jarsCollapsed,
  });

  const cellBase = {
    columns: panelW,
    selectedRecipeId,
    getTextureUrl,
    onSelectRecipe,
    onEditCopy,
    onToggleDisable,
    statusOf: (r: Recipe) => rowStatusOf(r, issuesMap),
    isDisabled,
    selected,
    toggleSelect,
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

      {selected.size > 0 && (
        <div className="recipe-bulk-bar">
          <span>{selected.size} selected</span>
          <button type="button" className="btn-secondary" onClick={() => onBulkReplace([...selected])}>
            Replace ingredient…
          </button>
          <button type="button" className="bulk-clear" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="recipe-explorer-groups" ref={groupsRef}>
        {noRecipesAtAll && (
          <div className="empty-state">
            No recipes yet — start one
            <div className="empty-hints">+ New Recipe · Copy a recipe · Import JSON</div>
          </div>
        )}
        {nothingMatches && (
          <div className="empty-state">No recipes match your filters.</div>
        )}
        {mineGrid && (
          <section className="recipe-group">
            <h4 className="recipe-group-title">Mine <span>{mine.length}</span></h4>
            <SectionGrid items={mine} cellData={cellBase} height={mineH} />
          </section>
        )}
        {packGrid && (
          <section className="recipe-group">
            <h4 className="recipe-group-title">Pack <span>{pack.length}</span></h4>
            <SectionGrid items={pack} cellData={cellBase} height={packH} />
          </section>
        )}
        {showJars && jars.length > 0 && (
          <section className="recipe-group recipe-group-jars">
            <h4 className="recipe-group-title recipe-group-toggle" onClick={() => setJarsCollapsed((c) => !c)}>
              <span className="recipe-group-caret">{jarsCollapsed ? '▸' : '▾'}</span>
              Jars <span>{jars.length}</span>
            </h4>
            {!jarsCollapsed && (
              <SectionGrid items={jars} cellData={cellBase} height={jarsH} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default RecipeExplorer;
