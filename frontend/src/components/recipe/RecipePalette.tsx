import { useState, useEffect, useRef } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { SearchResult, TagInfo, ItemRegistryEntry } from '../../services/api';
import { PackageIcon, TagIcon } from '../ui/icons'
import { SLOT_DRAG_MIME, type SlotDragPayload } from '../../core/recipe/dnd';

interface RecipePaletteProps {
  searchResults: SearchResult[];
  tagResults: TagInfo[];
  activeSearchTab: 'items' | 'tags' | 'registry';
  onDragStart: (item: SearchResult) => void;
  getTextureUrl: (itemId: string) => string | null;
  /** Instance item registry (already filtered by the editor) for the Registry tab. */
  registryItems: ItemRegistryEntry[];
  registryTotal: number;
  getRegistryTextureUrl: (itemId: string) => string | null;
}

const REGISTRY_ROW_HEIGHT = 56;

function setDragPayload(e: React.DragEvent, payload: SlotDragPayload) {
  e.dataTransfer?.setData(SLOT_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

type RegistryRowData = {
  items: ItemRegistryEntry[];
  getUrl: (id: string) => string | null;
};

function RegistryRow({ index, style, items, getUrl }: RowComponentProps<RegistryRowData>) {
  const item = items[index];
  if (!item) return <div style={style} />;
  const url = getUrl(item.id);
  return (
    <div style={style}>
      <div
        className="palette-item"
        draggable
        onDragStart={(e) => setDragPayload(e, { item: item.id, name: item.name })}
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

export function RecipePalette({
  searchResults,
  tagResults,
  activeSearchTab,
  onDragStart,
  getTextureUrl,
  registryItems,
  registryTotal,
  getRegistryTextureUrl,
}: RecipePaletteProps) {
  const title = activeSearchTab === 'items' ? 'Items' : activeSearchTab === 'tags' ? 'Tags' : 'Instance Items';
  const count =
    activeSearchTab === 'items'
      ? `${searchResults.length} results`
      : activeSearchTab === 'tags'
        ? `${tagResults.length} results`
        : `${registryItems.length} / ${registryTotal} items`;

  // Measure the grid so the virtualized registry list gets a real height
  // (the registry can hold tens of thousands of entries — never render them
  // as plain DOM rows).
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(400);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setGridHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeSearchTab]);

  return (
    <aside className="recipe-palette">
      <div className="palette-header">
        <h3>{title}</h3>
        <span className="result-count">{count}</span>
      </div>
      <div className="palette-grid" ref={gridRef}>
        {activeSearchTab === 'items' &&
          searchResults.map(item => (
            <div
              key={item.id}
              className="palette-item"
              draggable
              onDragStart={(e) => {
                onDragStart(item);
                setDragPayload(e, { item: item.id, name: item.name });
              }}
            >
              <div className="palette-item-icon">
                {getTextureUrl(item.id) ? (
                  <img src={getTextureUrl(item.id)!} alt={item.name} />
                ) : (
                  <PackageIcon size={16} />
                )}
              </div>
              <div className="palette-item-info">
                <span className="palette-item-name">{item.name}</span>
                <span className="palette-item-id">{item.id}</span>
              </div>
              {item.tags.length > 0 && (
                <div className="palette-item-tags">
                  {item.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="tag-badge">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}

        {activeSearchTab === 'tags' &&
          tagResults.map(tag => (
            <div key={tag.id} className="palette-item tag-item" draggable
              onDragStart={(e) => setDragPayload(e, { item: `#${tag.id}`, name: tag.name, tag: true })}>
              <div className="palette-item-icon"><TagIcon size={16} /></div>
              <div className="palette-item-info">
                <span className="palette-item-name">{tag.name}</span>
                <span className="palette-item-id">{tag.id}</span>
                <span className="tag-member-count">{tag.member_count} items</span>
              </div>
            </div>
          ))}

        {activeSearchTab === 'registry' &&
          (registryItems.length === 0 ? (
            <div className="palette-empty">
              {registryTotal === 0
                ? 'No instance items. Load a pack to index its item registry.'
                : 'No items match your query.'}
            </div>
          ) : (
            <List
              style={{ height: gridHeight }}
              rowComponent={RegistryRow}
              rowCount={registryItems.length}
              rowHeight={REGISTRY_ROW_HEIGHT}
              rowProps={{ items: registryItems, getUrl: getRegistryTextureUrl }}
              overscanCount={8}
            />
          ))}
      </div>
    </aside>
  );
}

export default RecipePalette;
