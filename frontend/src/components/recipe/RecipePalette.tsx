import { useState, useEffect, useMemo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api';
import { PackageIcon, ChevronRightIcon, ChevronDownIcon } from '../ui/icons'
import { SLOT_DRAG_MIME, type SlotDragPayload } from '../../core/recipe/dnd';
import { getTagItems, requestResolveTags, subscribeTagChanges } from '../../services/smart-filter-tags';

interface RecipePaletteProps {
  activeTab: 'items' | 'tags';
  /** Instance items (already filtered by the editor's query). */
  items: ItemRegistryEntry[];
  itemTotal: number;
  /** Local tag catalog (already filtered by the editor's query). */
  tags: ItemTagInfo[];
  tagTotal: number;
  /** Instance path used to resolve expanded tag members. */
  instancePath: string;
  getTextureUrl: (itemId: string) => string | null;
  onDragStart: (payload: { item: string; name: string }) => void;
}

const ITEM_ROW_HEIGHT = 56;
const TAG_ROW_HEIGHT = 48;
const MEMBER_ROW_HEIGHT = 24;
const MAX_MEMBERS_SHOWN = 40;

function setDragPayload(e: React.DragEvent, payload: SlotDragPayload) {
  e.dataTransfer?.setData(SLOT_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

type ItemRowData = {
  items: ItemRegistryEntry[];
  getUrl: (id: string) => string | null;
  onDragStart: (payload: { item: string; name: string }) => void;
};

function ItemRow({ index, style, items, getUrl, onDragStart }: RowComponentProps<ItemRowData>) {
  const item = items[index];
  if (!item) return <div style={style} />;
  const url = getUrl(item.id);
  return (
    <div style={style}>
      <div
        className="palette-item"
        draggable
        onDragStart={(e) => {
          onDragStart({ item: item.id, name: item.name });
          setDragPayload(e, { item: item.id, name: item.name });
        }}
      >
        <div className="palette-item-icon">
          {url ? (
            <img src={url} alt={item.name} />
          ) : (
            <PackageIcon size={16} />
          )}
        </div>
        <div className="palette-item-info">
          <span className="palette-item-name">{item.name}</span>
          <span className="palette-item-id">{item.id}</span>
          {item.mod_id && <span className="palette-item-mod">{item.mod_id}</span>}
        </div>
      </div>
    </div>
  );
}

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
  onDragStart: (payload: { item: string; name: string }) => void;
};

function tagRowHeight(row: TagRow): number {
  return row.kind === 'tag' ? TAG_ROW_HEIGHT : MEMBER_ROW_HEIGHT;
}

function TagRowRenderer({ index, style, rows, getUrl, onToggle, expanded, onDragStart }: RowComponentProps<TagRowData>) {
  const row = rows[index];
  if (!row) return <div style={style} />;
  if (row.kind === 'tag') {
    const isOpen = expanded.has(row.tag.id);
    return (
      <div style={style}>
        <div
          className="palette-item tag-item"
          draggable
          onDragStart={(e) => {
            onDragStart({ item: `#${row.tag.id}`, name: row.tag.id });
            setDragPayload(e, { item: `#${row.tag.id}`, name: row.tag.id, tag: true });
          }}
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
          onDragStart({ item: row.item, name: row.item });
          setDragPayload(e, { item: row.item, name: row.item });
        }}
        title={`Drag ${row.item} into the grid`}
      >
        {url ? <img src={url} alt="" className="tag-member-icon" /> : <span className="tag-member-bullet">•</span>}
        <span className="tag-member-id">{row.item}</span>
      </div>
    </div>
  );
}

export function RecipePalette({
  activeTab,
  items,
  itemTotal,
  tags,
  tagTotal,
  instancePath,
  getTextureUrl,
  onDragStart,
}: RecipePaletteProps) {
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

  const rows = useMemo<TagRow[]>(() => {
    if (activeTab !== 'tags') return [];
    const out: TagRow[] = [];
    for (const tag of tags) {
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
  }, [activeTab, tags, expanded]);

  const title = activeTab === 'items' ? 'Items' : 'Tags';
  const count =
    activeTab === 'items'
      ? `${items.length} / ${itemTotal} items`
      : `${tags.length} / ${tagTotal} tags`;

  return (
    <aside className="recipe-palette">
      <div className="palette-header">
        <h3>{title}</h3>
        <span className="result-count">{count}</span>
      </div>
      <div className="palette-grid">
        {activeTab === 'items' &&
          (items.length === 0 ? (
            <div className="palette-empty">
              {itemTotal === 0
                ? 'No instance items. Load a pack to index its item registry.'
                : 'No items match your query.'}
            </div>
          ) : (
            <List
              style={{ height: '100%' }}
              rowComponent={ItemRow}
              rowCount={items.length}
              rowHeight={ITEM_ROW_HEIGHT}
              rowProps={{ items, getUrl: getTextureUrl, onDragStart }}
              overscanCount={8}
            />
          ))}

        {activeTab === 'tags' &&
          (tags.length === 0 ? (
            <div className="palette-empty">
              {tagTotal === 0
                ? 'No item tags found in the instance.'
                : 'No tags match your query.'}
            </div>
          ) : (
            <List
              style={{ height: '100%' }}
              rowComponent={TagRowRenderer}
              rowCount={rows.length}
              rowHeight={(index) => tagRowHeight(rows[index])}
              rowProps={{ rows, getUrl: getTextureUrl, onToggle: toggleTag, expanded, onDragStart }}
              overscanCount={8}
            />
          ))}
      </div>
    </aside>
  );
}

export default RecipePalette;
