import { useEffect, useMemo, useState } from 'react';
import { CheckSquareIcon, SquareIcon } from '../ui/icons'
import { usePackRecipes } from '../../hooks/usePackRecipes';
import type { DiscoveredRecipe } from '../../services/api';
import type { Recipe } from '../../core/recipe/recipe-store';

interface LoadPackRecipesModalProps {
  projectPath: string;
  onClose: () => void;
  onImport: (recipes: Recipe[]) => number;
  existingRecipes?: Recipe[];
}

const ORIGIN_LABEL: Record<string, string> = {
  vanilla: 'Vanilla JSON',
  kubejs: 'KubeJS',
  crafttweaker: 'CraftTweaker',
};

type OriginFilter = 'all' | 'vanilla' | 'kubejs' | 'crafttweaker';
type EditFilter = 'all' | 'editable' | 'readonly';
type StateFilter = 'all' | 'new' | 'loaded';

function originLabel(r: DiscoveredRecipe): string {
  return ORIGIN_LABEL[r.origin] ?? r.origin;
}

function keyOf(r: DiscoveredRecipe): string {
  return `${r.source}|${r.recipe.output.item}`;
}

function keyOfRecipe(r: Recipe): string {
  return `${r.source}|${r.output.item}`;
}

/** Scan the pack (including mod jars) for recipes and let the user search,
 * filter, and load the ones they want to edit. */
export function LoadPackRecipesModal({ projectPath, onClose, onImport, existingRecipes = [] }: LoadPackRecipesModalProps) {
  const { scanning, error, recipes: all } = usePackRecipes(projectPath);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importedCount, setImportedCount] = useState(0);

  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [editFilter, setEditFilter] = useState<EditFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (all.length > 0) {
      setSelected(new Set(all.map((r) => keyOf(r))));
      setLoadedIds(
        new Set(
          existingRecipes
            .filter((r) => r.source)
            .map(keyOfRecipe)
        )
      );
    }
  }, [all, existingRecipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (originFilter !== 'all' && r.origin !== originFilter) return false;
      if (editFilter === 'editable' && !r.editable) return false;
      if (editFilter === 'readonly' && r.editable) return false;
      const key = keyOf(r);
      if (stateFilter === 'new' && loadedIds.has(key)) return false;
      if (stateFilter === 'loaded' && !loadedIds.has(key)) return false;
      if (!q) return true;
      return (
        r.recipe.name.toLowerCase().includes(q) ||
        r.recipe.output.item.toLowerCase().includes(q) ||
        r.recipe.type.includes(q) ||
        r.label.toLowerCase().includes(q)
      );
    });
  }, [all, query, originFilter, editFilter, stateFilter, loadedIds]);

  const grouped = useMemo(() => {
    const g: Record<string, DiscoveredRecipe[]> = {};
    for (const r of filtered) {
      const dir = r.source.startsWith('jar:')
        ? r.label
        : r.label.split('/').slice(0, -1).join('/') || r.label;
      const key = `${originLabel(r)} — ${dir}`;
      (g[key] ??= []).push(r);
    }
    return g;
  }, [filtered]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const doImport = () => {
    const chosen = all.filter((r) => selected.has(keyOf(r)));
    if (chosen.length === 0) return;
    const count = onImport(chosen.map((r) => r.recipe));
    if (count > 0) {
      setImportedCount((n) => n + count);
      setLoadedIds((prev) => {
        const next = new Set(prev);
        for (const r of chosen) next.add(keyOf(r));
        return next;
      });
    }
  };

  const shownCount = Object.values(grouped).reduce((n, g) => n + g.length, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal load-pack-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Load pack recipes</h2>
        <p>Scanning {projectPath} for recipes — including inside mod jars.</p>

        {scanning && <div className="import-preview">Scanning…</div>}
        {error && <div className="import-error">{error}</div>}
        {!scanning && !error && (
          <>
            <div className="load-filters">
              <input
                type="text"
                placeholder="Search recipes (name / output / type)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="recipe-list-search"
              />
              <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}>
                <option value="all">All sources</option>
                <option value="vanilla">Vanilla JSON</option>
                <option value="kubejs">KubeJS</option>
                <option value="crafttweaker">CraftTweaker</option>
              </select>
              <select value={editFilter} onChange={(e) => setEditFilter(e.target.value as EditFilter)}>
                <option value="all">Editable + read-only</option>
                <option value="editable">Pack-editable only</option>
                <option value="readonly">Mod-jar read-only</option>
              </select>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilter)}>
                <option value="all">All states</option>
                <option value="new">Not yet loaded</option>
                <option value="loaded">Already loaded</option>
              </select>
            </div>

            <div className="load-summary">
              {shownCount} of {all.length} recipes shown · {all.filter((r) => !r.editable).length} in mod jars
            </div>

            {all.length === 0 && <div className="empty-state">No recipes found in this pack.</div>}
            {all.length > 0 && shownCount === 0 && (
              <div className="empty-state">No recipes match your filters.</div>
            )}

            {Object.entries(grouped).map(([group, recipes]) => (
              <div key={group} className="load-group">
                <div className="load-group-head">
                  <button
                    className="load-toggle-all"
                    onClick={() => {
                      const keys = recipes.map((r) => keyOf(r));
                      const allOn = keys.every((k) => selected.has(k));
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const k of keys) { if (allOn) next.delete(k); else next.add(k); }
                        return next;
                      });
                    }}
                  >
                    {recipes.every((r) => selected.has(keyOf(r))) ? <CheckSquareIcon size={14} /> : <SquareIcon size={14} />} {group}
                  </button>
                  <span className="result-count">{recipes.length}</span>
                </div>
                <div className="load-group-list">
                  {recipes.map((r) => {
                    const key = keyOf(r);
                    const loaded = loadedIds.has(key);
                    return (
                      <label key={key} className={`load-recipe-item ${selected.has(key) ? 'is-on' : ''}`}>
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                        <span className="recipe-type-badge">{r.recipe.type}</span>
                        <span className="load-recipe-name" title={r.recipe.output.item}>
                          {r.recipe.name}
                        </span>
                        {!r.editable && <span className="origin-badge readonly">jar</span>}
                        {loaded && <span className="origin-badge loaded">loaded</span>}
                        <span className="load-recipe-label">{r.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {importedCount > 0 && <div className="import-preview">Imported {importedCount} recipes.</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={doImport} disabled={selected.size === 0}>
            Import ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoadPackRecipesModal;