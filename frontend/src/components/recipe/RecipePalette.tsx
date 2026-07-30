import type { SearchResult, TagInfo } from '../../services/api';

interface RecipePaletteProps {
  searchResults: SearchResult[];
  tagResults: TagInfo[];
  activeSearchTab: 'items' | 'tags';
  onDragStart: (item: SearchResult) => void;
  getTextureUrl: (itemId: string) => string | null;
}

export function RecipePalette({
  searchResults,
  tagResults,
  activeSearchTab,
  onDragStart,
  getTextureUrl,
}: RecipePaletteProps) {
  return (
    <aside className="recipe-palette">
      <div className="palette-header">
        <h3>{activeSearchTab === 'items' ? 'Items' : 'Tags'}</h3>
        <span className="result-count">
          {activeSearchTab === 'items' ? searchResults.length : tagResults.length} results
        </span>
      </div>
      <div className="palette-grid">
        {activeSearchTab === 'items' ? (
          searchResults.map(item => (
            <div
              key={item.id}
              className="palette-item"
              draggable
              onDragStart={() => onDragStart(item)}
            >
              <div className="palette-item-icon">
                {getTextureUrl(item.id) ? (
                  <img src={getTextureUrl(item.id)!} alt={item.name} />
                ) : (
                  <span>📦</span>
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
          ))
        ) : (
          tagResults.map(tag => (
            <div key={tag.id} className="palette-item tag-item">
              <div className="palette-item-icon">🏷️</div>
              <div className="palette-item-info">
                <span className="palette-item-name">{tag.name}</span>
                <span className="palette-item-id">{tag.id}</span>
                <span className="tag-member-count">{tag.member_count} items</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default RecipePalette;
