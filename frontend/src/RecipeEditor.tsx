import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRecipeStore } from './core/recipe/recipe-store';
import { CraftingGrid } from './components/recipe/CraftingGrid';
import type { Recipe, RecipeIngredient, RecipeType } from './core/recipe/recipe-store';
import './RecipeEditor.css';

interface RecipeEditorProps {
  projectId: string;
  projectPath: string;
}

interface ItemSearchResult {
  id: string;
  name: string;
  texture_url: string | null;
  tags: string[];
  source: string;
  mod_id: string | null;
  version: string | null;
}

interface TagSearchResult {
  id: string;
  name: string;
  member_count: number;
  description: string | null;
}

export function RecipeEditor({ projectId, projectPath }: RecipeEditorProps) {
  const { 
    recipes, 
    selectedRecipeId, 
    dirty,
    addRecipe, 
    updateRecipe, 
    deleteRecipe, 
    selectRecipe,
    markClean,
    getSelectedRecipe 
  } = useRecipeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchTab, setActiveSearchTab] = useState<'items' | 'tags'>('items');
  const [searchResults, setSearchResults] = useState<ItemSearchResult[]>([]);
  const [tagResults, setTagResults] = useState<TagSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedItem, setDraggedItem] = useState<ItemSearchResult | null>(null);
  const [textureCache, setTextureCache] = useState<Record<string, string>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const selectedRecipe = getSelectedRecipe();

  // Load textures on mount
  useEffect(() => {
    if (projectPath) {
      const modsDir = `${projectPath}/mods`;
      scanTextures(modsDir);
    }
  }, [projectPath]);

  const scanTextures = async (modsDir: string) => {
    try {
      const result = await invoke<Record<string, string>>('scan_mod_jar_textures', { modsDir });
      setTextureCache(result);
    } catch (e) {
      console.error('Failed to scan textures:', e);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setTagResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const loader = 'neoforge';
      const mcVersion = '1.21.1';

      const [items, tags] = await Promise.all([
        invoke<ItemSearchResult[]>('search_items', { query, loader, mcVersion }),
        invoke<TagSearchResult[]>('search_tags', { query, loader, mcVersion }),
      ]);

      setSearchResults(items);
      setTagResults(tags);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, handleSearch]);

  const handleDragStart = (item: ItemSearchResult) => {
    setDraggedItem(item);
  };

  const handleGridChange = (grid: (RecipeIngredient | null)[][]) => {
    if (!selectedRecipe) return;

    if (selectedRecipe.type === 'shaped' && selectedRecipe.key) {
      const pattern = grid.map(row => row.map(c => c?.item || ' ').join(''));
      const key: Record<string, RecipeIngredient> = {};
      grid.forEach(row => row.forEach(cell => {
        if (cell && cell.item && !selectedRecipe.key![cell.item]) {
          key[cell.item] = { item: cell.item, count: cell.count, tag: cell.tag };
        }
      }));
      updateRecipe(selectedRecipe.id, { pattern, key });
    } else if (selectedRecipe.type === 'shapeless') {
      const ingredients = grid.flatMap(row => row.filter(c => c).map(c => ({ item: c!.item, count: c!.count, tag: c!.tag })));
      updateRecipe(selectedRecipe.id, { ingredients });
    }
  };

  const handleSaveRecipes = async () => {
    if (!projectId) return;

    try {
      setShowSaveDialog(true);
      setSaveMessage('Generating scripts...');

      const allRecipes = recipes.filter((r: Recipe) => r.output.item);
      const { kubejsScript, crafttweakerScript } = await invoke<{ kubejsScript: string; crafttweakerScript: string }>(
        'generate_recipe_scripts',
        { projectId, recipes: allRecipes }
      );

      const scriptsDir = `${projectPath}/scripts`;
      await invoke('write_script_files', {
        projectId,
        kubejsScript,
        crafttweakerScript,
      });

      setSaveMessage('Scripts saved successfully!');
      markClean();
      
      // Hot-reload if companion mod connected
      await invoke('ws_ipc_send_event', {
        eventType: 'RELOAD_KUBEJS_SCRIPTS',
        paths: [`${scriptsDir}/kubejs/startup_scripts/recipes.js`],
      });

      setTimeout(() => {
        setShowSaveDialog(false);
        setSaveMessage('');
      }, 3000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveMessage(`Error: ${e}`);
    }
  };

  const handleNewRecipe = () => {
    const newRecipe: Omit<Recipe, 'id'> = {
      type: 'shaped',
      name: 'New Recipe',
      group: '',
      pattern: ['   ', '   ', '   '],
      key: {},
      ingredients: [],
      output: { item: '', count: 1 },
    };
    const id = addRecipe(newRecipe);
    selectRecipe(id);
  };

  const handleDeleteRecipe = () => {
    if (selectedRecipe && window.confirm(`Delete "${selectedRecipe.name}"?`)) {
      deleteRecipe(selectedRecipe.id);
    }
  };

  const handleTypeChange = (type: RecipeType) => {
    if (selectedRecipe) {
      updateRecipe(selectedRecipe.id, { type });
    }
  };

  const getTextureUrl = (itemId: string) => {
    return textureCache[itemId] || textureCache[itemId.replace(/^minecraft:/, '')] || null;
  };

  // Build initial grid for CraftingGrid component
  const buildInitialGrid = () => {
    if (!selectedRecipe?.pattern) return undefined;
    return selectedRecipe.pattern.map(row => 
      row.split('').map(char => char === ' ' ? null : { item: char, count: 1 })
    );
  };

  const getGridSize = () => {
    if (!selectedRecipe) return 3;
    const type = selectedRecipe.type;
    return (type === 'stonecutting' || type === 'smelting' || type === 'blasting' || 
            type === 'smoking' || type === 'campfire') ? 2 : 3;
  };

  return (
    <div className="recipe-editor">
      <header className="recipe-editor-header">
        <h2>Recipe Editor</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Search items/tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <div className="search-tabs">
            <button 
              className={activeSearchTab === 'items' ? 'active' : ''}
              onClick={() => setActiveSearchTab('items')}
            >Items</button>
            <button 
              className={activeSearchTab === 'tags' ? 'active' : ''}
              onClick={() => setActiveSearchTab('tags')}
            >Tags</button>
          </div>
          {isSearching && <span className="search-loading">Loading...</span>}
        </div>
      </header>

      <div className="recipe-editor-body">
        {/* Left Panel: Item/Tag Palette */}
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
                  onDragStart={() => handleDragStart(item)}
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

        {/* Center Panel: Crafting Grid + Recipe List */}
        <main className="recipe-canvas">
          {/* Recipe List */}
          <div className="recipe-list-panel">
            <div className="recipe-list-header">
              <h3>Recipes ({recipes.length})</h3>
              <button className="btn-primary" onClick={handleNewRecipe}>+ New Recipe</button>
            </div>
            <div className="recipe-list">
              {recipes.map(recipe => (
                <div
                  key={recipe.id}
                  className={`recipe-list-item ${selectedRecipeId === recipe.id ? 'selected' : ''}`}
                  onClick={() => selectRecipe(recipe.id)}
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

          {/* Crafting Grid */}
          {selectedRecipe && (
            <div className="crafting-grid-panel">
              <div className="crafting-grid-header">
                <select
                  value={selectedRecipe.type}
                  onChange={(e) => handleTypeChange(e.target.value as RecipeType)}
                  className="recipe-type-select"
                >
                  <option value="shaped">Shaped</option>
                  <option value="shapeless">Shapeless</option>
                  <option value="smithing">Smithing</option>
                  <option value="stonecutting">Stonecutting</option>
                  <option value="smelting">Smelting</option>
                  <option value="blasting">Blasting</option>
                  <option value="smoking">Smoking</option>
                  <option value="campfire">Campfire</option>
                </select>
                <input
                  type="text"
                  placeholder="Recipe group (optional)"
                  value={selectedRecipe.group || ''}
                  onChange={(e) => updateRecipe(selectedRecipe.id, { group: e.target.value })}
                  className="recipe-group-input"
                />
              </div>
              <CraftingGrid
                size={getGridSize()}
                initialGrid={buildInitialGrid()}
                onChange={handleGridChange}
              />
              <div className="output-section">
                <label>Output:</label>
                <div className="output-editor">
                  {getTextureUrl(selectedRecipe.output.item) && (
                    <img src={getTextureUrl(selectedRecipe.output.item)!} alt="" className="output-icon" />
                  )}
                  <input
                    type="text"
                    placeholder="Output item ID"
                    value={selectedRecipe.output.item}
                    onChange={(e) => updateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, item: e.target.value } })}
                  />
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={selectedRecipe.output.count}
                    onChange={(e) => updateRecipe(selectedRecipe.id, { output: { ...selectedRecipe.output, count: parseInt(e.target.value) || 1 } })}
                    style={{ width: '60px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Recipe Actions */}
          {selectedRecipe && (
            <div className="recipe-actions">
              <button className="btn-secondary" onClick={() => { /* Duplicate logic */ }}>Duplicate</button>
              <button className="btn-danger" onClick={handleDeleteRecipe}>Delete</button>
              <button className="btn-primary" onClick={handleSaveRecipes} disabled={!dirty}>
                {dirty ? 'Save & Hot-Reload' : 'Saved'}
              </button>
            </div>
          )}
        </main>

        {/* Right Panel: Search Results Detail */}
        <aside className="recipe-detail">
          {draggedItem && (
            <div className="detail-card dragged-preview">
              <h4>Dragged Item</h4>
              <div className="detail-item">
                <img src={getTextureUrl(draggedItem.id) || ''} alt="" />
                <div>
                  <strong>{draggedItem.name}</strong>
                  <small>{draggedItem.id}</small>
                </div>
              </div>
              <p>Drop onto the crafting grid to add</p>
            </div>
          )}
        </aside>
      </div>

      {showSaveDialog && (
        <div className="save-toast">{saveMessage}</div>
      )}
    </div>
  );
}

export default RecipeEditor;