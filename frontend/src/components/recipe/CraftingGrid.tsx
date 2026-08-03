import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { RecipeIngredient, RecipeOutput } from '../../core/recipe/recipe-store';
import './CraftingGrid.css';

interface CraftingGridProps {
  size?: 2 | 3;
  onChange?: (grid: (RecipeIngredient | null)[][]) => void;
  initialGrid?: (RecipeIngredient | null)[][];
}

const EMPTY_2x2: (RecipeIngredient | null)[][] = [
  [null, null],
  [null, null],
];

const EMPTY_3x3: (RecipeIngredient | null)[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

export function CraftingGrid({ 
  size = 3, 
  onChange, 
  initialGrid 
}: CraftingGridProps) {
  const [grid, setGrid] = useState<(RecipeIngredient | null)[][]>(
    () => initialGrid || (size === 2 ? EMPTY_2x2 : EMPTY_3x3)
  );
  const [shapeless, setShapeless] = useState(false);
  const [draggedItem, setDraggedItem] = useState<RecipeIngredient | null>(null);
  const [dragFrom, setDragFrom] = useState<{ row: number; col: number } | null>(null);
  const dragOverRef = useRef<{ row: number; col: number } | null>(null);
  const emitLockRef = useRef(true);
  const suppressNextEmit = useRef(false);

  // Key from props so we can re-sync when a different recipe is selected.
  const initialKey = useRef<string>('');

  const syncKey = useCallback((g: (RecipeIngredient | null)[][]): string => {
    return JSON.stringify(g.map((r) => r.map((c) => (c ? `${c.tag ? '#' : ''}${c.item}` : ''))));
  }, []);

  const currentKey = syncKey(initialGrid ?? (size === 2 ? EMPTY_2x2 : EMPTY_3x3));

  // Sync from props whenever the recipe content changes (new recipe / type).
  useEffect(() => {
    if (currentKey === initialKey.current) return;
    initialKey.current = currentKey;
    suppressNextEmit.current = true;
    setGrid(initialGrid || (size === 2 ? EMPTY_2x2 : EMPTY_3x3));
  }, [currentKey, initialGrid, size]);

  // Emit grid changes to the parent, but never on the initial mount, and never
  // for changes that came from syncing props (a recipe switch / type change).
  useEffect(() => {
    if (emitLockRef.current) {
      emitLockRef.current = false;
      return;
    }
    if (suppressNextEmit.current) {
      suppressNextEmit.current = false;
      return;
    }
    if (onChange) {
      onChange(grid);
    }
  }, [grid, onChange]);

  const handleDragStart = useCallback((e: React.DragEvent, item: RecipeIngredient, row: number, col: number) => {
    setDraggedItem(item);
    setDragFrom({ row, col });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverRef.current = { row, col };
  }, []);

  const handleDragLeave = useCallback(() => {
    dragOverRef.current = null;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    
    if (!draggedItem || !dragFrom) return;

    const newGrid = grid.map((r, ri) => 
      r.map((c, ci) => {
        if (ri === dragFrom.row && ci === dragFrom.col) return null;
        if (ri === row && ci === col) return draggedItem;
        return c;
      })
    );

    setGrid(newGrid);
    setDraggedItem(null);
    setDragFrom(null);
    dragOverRef.current = null;
  }, [draggedItem, dragFrom, grid]);

  const handleClearCell = useCallback((row: number, col: number) => {
    const newGrid = grid.map((r, ri) => 
      r.map((c, ci) => (ri === row && ci === col) ? null : c)
    );
    setGrid(newGrid);
  }, [grid]);

  const handleOutputChange = useCallback((output: RecipeOutput) => {
    // This would be handled by parent component
    console.log('Output changed:', output);
  }, []);

  return (
    <div className="crafting-grid-container">
      <div className="crafting-grid-wrapper">
        <table className={`crafting-grid crafting-grid-${size}x${size}`}>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td 
                    key={colIndex}
                    className="crafting-cell"
                    tabIndex={0}
                    aria-label={`Crafting slot row ${rowIndex + 1}, column ${colIndex + 1}`}
                    onDragStart={(e) => cell && handleDragStart(e, cell, rowIndex, colIndex)}
                    onDragOver={(e) => handleDragOver(e, rowIndex, colIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, rowIndex, colIndex)}
                    onDoubleClick={() => cell && handleClearCell(rowIndex, colIndex)}
                  >
                    {cell && (
                      <div className="crafting-cell-content" draggable>
                        <span className="crafting-item-name">{cell.item}</span>
                        {cell.count && cell.count > 1 && (
                          <span className="crafting-item-count">{cell.count}</span>
                        )}
                        {cell.tag && <span className="crafting-tag-badge">#</span>}
                      </div>
                    )}
                    {!cell && dragOverRef.current?.row === rowIndex && dragOverRef.current?.col === colIndex && (
                      <div className="crafting-drop-indicator">+</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="crafting-output">
        <label>Output:</label>
        <div className="output-slot" onDrop={(e) => e.preventDefault()} aria-label="Recipe output slot">
          <RecipeOutputEditor onChange={handleOutputChange} />
        </div>
      </div>

      <div className="crafting-options">
        <label>
          <input 
            type="checkbox" 
            checked={shapeless}
            onChange={(e) => setShapeless(e.target.checked)}
            role="switch"
            aria-checked={shapeless}
            tabIndex={0}
          />
          Shapeless
        </label>
        <label>
          <input 
            type="text" 
            placeholder="Recipe group (optional)"
            className="recipe-group-input"
          />
        </label>
      </div>
    </div>
  );
}

interface RecipeOutputEditorProps {
  onChange: (output: RecipeOutput) => void;
}

function RecipeOutputEditor({ onChange }: RecipeOutputEditorProps) {
  const [item, setItem] = useState('');
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (item) {
      onChange({ item, count });
    }
  }, [item, count, onChange]);

  return (
    <div className="output-editor">
      <input
        type="text"
        placeholder="Item ID (e.g., minecraft:diamond)"
        value={item}
        onChange={(e) => setItem(e.target.value)}
        className="output-item-input"
      />
      <input
        type="number"
        min="1"
        max="64"
        value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(64, parseInt(e.target.value) || 1)))}
        className="output-count-input"
      />
    </div>
  );
}

export default CraftingGrid;