import { useEffect, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api';
import { ChevronRightIcon, ChevronDownIcon } from '../ui/icons'
import { setDragPayload, clearDragPayload } from '../../core/recipe/dnd';
import { getTagItems, requestResolveTags, subscribeTagChanges } from '../../services/smart-filter-tags';
import { filterTagCatalog } from '../../core/recipe/tag-filter';
import { ItemBrowser } from './ItemBrowser';

interface RecipePaletteProps {
  /** Full instance item registry (filtered internally). */
  items: ItemRegistryEntry[];
  /** Full local tag catalog (filtered internally). */
  tags: ItemTagInfo[];
  /** Instance path used to resolve expanded tag members. */
  instancePath: string;
  getTextureUrl: (itemId: string) => string | null;
  /** Highlight recipes using an item (`id`) or tag (`#id`). */
  onShowRecipesUsing: (itemOrTagId: string) => void;
}

const MEMBER_ROW_HEIGHT = 24;
const MAX_MEMBERS_SHOWN = 40;

// Tags are virtualized as a flat list of rows: a collapsed tag row, or an
// expanded tag row followed by its member rows (variable heights).
type TagRow =
  | { kind: 'tag'; tag: ItemTagInfo }
  | { kind: 'member'; tagId: string; item: string }
  | { kind: 'overflow'; tagId: string; extra: number };

type TagRowData = {
  rows: TagRow[];
  getUrl: (id: string) => string | null;
  onToggle: (tagId: string) => void;
  expanded: Set<string>;
  onShowRecipesUsing: (itemOrTagId: string) => void;
};

function tagRowHeight(row: TagRow): number {
  return row.kind === 'tag' ? 48 : MEMBER_ROW_HEIGHT;
}

function TagRowRenderer({ index, style, rows, getUrl, onToggle, expanded, onShowRecipesUsing }: RowComponentProps<TagRowData>) {
  const row = rows[index];
  if (!row) return <div style={style} />;
  if (row.kind === 'tag') {
    const isOpen = expanded.has(row.tag.id);
    return (
      <div style={style}>
        <div
          className="palette-item tag-item"
          onClick={() => onToggle(row.tag.id)}
          title={isOpen ? 'Collapse tag members' : `Expand ${row.tag.id} members`}
        >
          <div className="palette-item-icon">
            {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </div>
          <div className="palette-item-info">
            <span className="palette-item-name">{row.tag.id}</span>
            <span className="tag-member-count">{row.tag.member_count} items</span>
          </div>
          <span className="tag-badge">#</span>
          <button
            type="button"
            className="palette-using"
            onClick={(e) => { e.stopPropagation(); onShowRecipesUsing(`#${row.tag.id}`); }}
            title="Show recipes using this tag"
          >
            ⇄
          </button>
        </div>
      </div>
    );
  }
  if (row.kind === 'overflow') {
    return (
      <div style={style}>
        <div className="tag-member-overflow">… and {row.extra} more</div>
      </div>
    );
  }
  const url = getUrl(row.item);
  return (
    <div style={style}>
      <div
        className="tag-member-row"
        draggable
        onDragStart={(e) => {
          setDragPayload(e.dataTransfer, { item: row.item, name: row.item });
        }}
        onDragEnd={() => clearDragPayload()}
        title={`Drag ${row.item} into the grid`}
      >
        {url ? <img src={url} alt="" className="tag-member-icon" /> : <span className="tag-member-bullet">•</span>}
        <span className="tag-member-id">{row.item}</span>
      </div>
    </div>
  );
}

/**
 * The recipes-tab right rail. Items render the shared JEI-style ItemBrowser
 * in browse mode (drag into the grid, ⇄ for recipes-using) — the same
 * surface the picker popup uses. Tags keep the expandable member list; the
 * palette also exposes a tags-first view to mirror the browser's #tag search.
 */
export function RecipePalette({
  items,
  tags,
  instancePath,
  getTextureUrl,
  onShowRecipesUsing,
}: RecipePaletteProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'tags'>('items');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, setTagTick] = useState(0);

  // Re-render tag rows when members finish resolving (they arrive async).
  useEffect(() => subscribeTagChanges(() => setTagTick((t) => t + 1)), []);

  const toggleTag = (tagId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
        requestResolveTags([tagId], instancePath);
      }
      return next;
    });
  };

  const tagsFiltered = useMemo(() => filterTagCatalog(tags, query), [tags, query]);

  const rows = useMemo<TagRow[]>(() => {
    if (activeTab !== 'tags') return [];
    const out: TagRow[] = [];
    for (const tag of tagsFiltered) {
      out.push({ kind: 'tag', tag });
      if (!expanded.has(tag.id)) continue;
      const members = getTagItems(tag.id) ?? [];
      for (const item of members.slice(0, MAX_MEMBERS_SHOWN)) {
        out.push({ kind: 'member', tagId: tag.id, item });
      }
      const extra = members.length - MAX_MEMBERS_SHOWN;
      if (extra > 0) out.push({ kind: 'overflow', tagId: tag.id, extra });
    }
    return out;
  }, [activeTab, tagsFiltered, expanded]);

  return (
    <aside className="recipe-palette">
      <div className="palette-header">
        <div className="segmented-row palette-tabs">
          <button className={activeTab === 'items' ? 'active' : ''} onClick={() => setActiveTab('items')}>Items</button>
          <button className={activeTab === 'tags' ? 'active' : ''} onClick={() => setActiveTab('tags')}>Tags</button>
        </div>
      </div>

      {activeTab === 'items' ? (
        <div className="palette-browser">
          <ItemBrowser
            items={items}
            tags={tags}
            getTextureUrl={getTextureUrl}
            mode="browse"
            onDragStart={() => {}}
            onShowRecipesUsing={onShowRecipesUsing}
          />
        </div>
      ) : (
        <>
          <div className="palette-search-row">
            <input
              type="text"
              placeholder="Filter tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="recipe-list-search"
            />
            <span className="result-count">{tagsFiltered.length} / {tags.length}</span>
          </div>
          <div className="palette-grid">
            {tagsFiltered.length === 0 ? (
              <div className="palette-empty">
                {tags.length === 0 ? 'No item tags found in the instance.' : 'No tags match your query.'}
              </div>
            ) : (
              <List
                style={{ height: '100%' }}
                rowComponent={TagRowRenderer}
                rowCount={rows.length}
                rowHeight={(index) => tagRowHeight(rows[index])}
                rowProps={{ rows, getUrl: getTextureUrl, onToggle: toggleTag, expanded, onShowRecipesUsing }}
                overscanCount={8}
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default RecipePalette;
