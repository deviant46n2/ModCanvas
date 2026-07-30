import { useState, useEffect, useCallback } from 'react';
import { useRecipeStore } from './core/recipe/recipe-store';
import { RecipePalette } from './components/recipe/RecipePalette';
import { RecipeList } from './components/recipe/RecipeList';
import { CraftingGridPanel } from './components/recipe/CraftingGridPanel';
import { searchItems, searchTags, scanModJarTextures, generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from './services/api';
import type { Recipe, RecipeIngredient } from './core/recipe/recipe-store';
import type { SearchResult, TagInfo } from './services/api';
import './RecipeEditor.css';

interface RecipeEditorProps {
  projectId: string;
  projectPath: string;
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [tagResults, setTagResults] = useState<TagInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedItem, setDraggedItem] = useState<SearchResult | null>(null);
  const [textureCache, setTextureCache] = useState<Record<string, string>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const selectedRecipe = getSelectedRecipe();

  useEffect(() => {
    if (projectPath) {
      scanTextures(`${projectPath}/mods`);
    }
  }, [projectPath]);

  const scanTextures = async (modsDir: string) => {
    try {
      setTextureCache(await scanModJarTextures(modsDir));
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
      const [items, tags] = await Promise.all([
        searchItems(query, 'neoforge', '1.21.1'),
        searchTags(query, 'neoforge', '1.21.1'),
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
    const t = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

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
      const { kubejsScript, crafttweakerScript } = await generateRecipeScripts(projectId, allRecipes);
      await writeScriptFiles(projectId, kubejsScript, crafttweakerScript);
      setSaveMessage('Scripts saved successfully!');
      markClean();
      await wsIpcSendEvent('RELOAD_KUBEJS_SCRIPTS', `${projectPath}/scripts/kubejs/startup_scripts/recipes.js`);
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage(''); }, 3000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveMessage(`Error: ${e}`);
    }
  };

  const handleNewRecipe = () => {
    const id = addRecipe({
      type: 'shaped',
      name: 'New Recipe',
      group: '',
      pattern: ['   ', '   ', '   '],
      key: {},
      ingredients: [],
      output: { item: '', count: 1 },
    });
    selectRecipe(id);
  };

  const handleDeleteRecipe = () => {
    if (selectedRecipe && window.confirm(`Delete "${selectedRecipe.name}"?`)) {
      deleteRecipe(selectedRecipe.id);
    }
  };

  const getTextureUrl = (itemId: string) =>
    textureCache[itemId] || textureCache[itemId.replace(/^minecraft:/, '')] || null;

  const buildInitialGrid = () => {
    if (!selectedRecipe?.pattern) return undefined;
    return selectedRecipe.pattern.map(row =>
      row.split('').map(char => char === ' ' ? null : { item: char, count: 1 })
    );
  };

  const getGridSize = (): 2 | 3 => {
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
          <input type="text" placeholder="Search items/tags..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
          <div className="search-tabs">
            <button className={activeSearchTab === 'items' ? 'active' : ''}
              onClick={() => setActiveSearchTab('items')}>Items</button>
            <button className={activeSearchTab === 'tags' ? 'active' : ''}
              onClick={() => setActiveSearchTab('tags')}>Tags</button>
          </div>
          {isSearching && <span className="search-loading">Loading...</span>}
        </div>
      </header>

      <div className="recipe-editor-body">
        <RecipePalette
          searchResults={searchResults}
          tagResults={tagResults}
          activeSearchTab={activeSearchTab}
          onDragStart={setDraggedItem}
          getTextureUrl={getTextureUrl}
        />

        <main className="recipe-canvas">
          <RecipeList
            recipes={recipes}
            selectedRecipeId={selectedRecipeId}
            onSelectRecipe={selectRecipe}
            onNewRecipe={handleNewRecipe}
            getTextureUrl={getTextureUrl}
          />

          {selectedRecipe && (
            <CraftingGridPanel
              selectedRecipe={selectedRecipe}
              onTypeChange={(type) => updateRecipe(selectedRecipe.id, { type })}
              onUpdateRecipe={updateRecipe}
              onGridChange={handleGridChange}
              onSave={handleSaveRecipes}
              onDelete={handleDeleteRecipe}
              getTextureUrl={getTextureUrl}
              getGridSize={getGridSize}
              buildInitialGrid={buildInitialGrid}
              dirty={dirty}
            />
          )}
        </main>

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
