import { useState } from 'react';
import { XIcon } from '../ui/icons'
import type { RecipeIngredient } from '../../core/recipe/recipe-store';
import { recipeIngredientFromPayload, SLOT_DRAG_MIME, type SlotDragPayload } from '../../core/recipe/dnd';

interface IngredientSlotProps {
  label: string;
  value: RecipeIngredient | undefined;
  placeholder?: string;
  getTextureUrl: (itemId: string) => string | null;
  onDrop: (ing: RecipeIngredient | null) => void;
  onChange: (ing: RecipeIngredient | null) => void;
}

/** A single drop target used by the specialized editors. Holds one ingredient
 * (item or tag) and supports drop from the palette, typing an id, and clear. */
export function IngredientSlot({
  label,
  value,
  placeholder,
  getTextureUrl,
  onDrop,
  onChange,
}: IngredientSlotProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value?.item ?? '');
  const [over, setOver] = useState(false);

  const display = value?.item ?? '';

  const text = value
    ? `${value.tag ? '#' : ''}${display}`
    : placeholder ?? `Drop or type ${label.toLowerCase()}`;

  return (
    <div
      className={`ingredient-slot ${over ? 'ingredient-slot-dragover' : ''} ${value ? 'is-filled' : ''}`}
      data-label={label}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(SLOT_DRAG_MIME);
        if (raw) {
          try {
            onDrop(recipeIngredientFromPayload(JSON.parse(raw) as SlotDragPayload));
          } catch {
            /* non-JSON drop ignored */
          }
        }
      }}
      onDoubleClick={() => { setEditing(true); setDraft(display); }}
    >
      {editing ? (
        <input
          className="ingredient-slot-input"
          value={draft}
          autoFocus
          placeholder="#tag or item:id"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = draft.trim();
              onChange(v ? { item: v, tag: v.startsWith('#') } : null);
              setEditing(false);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
            e.stopPropagation();
          }}
          onBlur={() => setEditing(false)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="ingredient-slot-icon">
            {value && getTextureUrl(value.item.replace(/^#/, '')) ? (
              <img
                src={getTextureUrl(value.item.replace(/^#/, ''))!}
                alt=""
                draggable={false}
              />
            ) : value ? (
              <span className="slot-fallback">#{value.tag ? 'tag' : 'item'}</span>
            ) : (
              <span className="slot-fallback">+</span>
            )}
          </span>
          <span className="ingredient-slot-label">{label}</span>
          <span className="ingredient-slot-text">{text}</span>
          {value && (
            <button
              type="button"
              className="ingredient-slot-clear"
              onClick={(e) => { e.stopPropagation(); onDrop(null); onChange(null); }}
              title={`Clear ${label}`}
              aria-label={`Clear ${label}`}
            >
              <XIcon size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default IngredientSlot;