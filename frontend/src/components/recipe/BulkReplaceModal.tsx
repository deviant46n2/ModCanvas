import { useMemo, useState } from 'react';
import { XIcon } from '../ui/icons';
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api';
import type { Recipe } from '../../core/recipe/recipe-store';
import {
  affectedRecipeIds,
  refKey,
  type IngredientRef,
} from '../../core/recipe/bulk-replace';

interface BulkReplaceModalProps {
  recipes: Recipe[];
  selectedIds: string[];
  items: ItemRegistryEntry[];
  tags: ItemTagInfo[];
  getTextureUrl: (itemId: string) => string | null;
  onClose: () => void;
  onApply: (from: IngredientRef, to: IngredientRef, affectedIds: string[]) => void;
}

function itemName(items: ItemRegistryEntry[], id: string): string {
  return items.find((i) => i.id === id)?.name ?? id;
}

function IngredientField({
  items,
  tags,
  getTextureUrl,
  label,
  value,
  onChange,
}: {
  items: ItemRegistryEntry[];
  tags: ItemTagInfo[];
  getTextureUrl: (itemId: string) => string | null;
  label: string;
  value: IngredientRef | null;
  onChange: (ref: IngredientRef | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const isTagQuery = q.startsWith('#');
  const tagQ = isTagQuery ? q.slice(1) : q;

  const itemHits = useMemo(
    () =>
      isTagQuery
        ? []
        : items
            .filter(
              (i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
            )
            .slice(0, 20),
    [items, q, isTagQuery],
  );
  const tagHits = useMemo(
    () => tags.filter((t) => t.id.toLowerCase().includes(tagQ)).slice(0, 10),
    [tags, tagQ],
  );

  const rawUsable = q.length > 0 && !value;
  const showDropdown = open && (itemHits.length > 0 || tagHits.length > 0 || rawUsable);

  return (
    <div className="bulk-replace-field">
      <span className="bulk-replace-field-label">{label}</span>
      {value ? (
        <div className="bulk-replace-selected">
          {!value.tag && getTextureUrl(value.item) && (
            <img src={getTextureUrl(value.item)!} alt="" className="bulk-replace-icon" />
          )}
          <span className={value.tag ? 'is-tag' : ''}>
            {value.tag ? `#${value.item}` : value.item}
          </span>
          <span className="bulk-replace-selected-name">{value.tag ? '' : itemName(items, value.item)}</span>
          <button
            type="button"
            className="bulk-replace-clear"
            onClick={() => { onChange(null); setOpen(false); }}
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <XIcon size={12} />
          </button>
        </div>
      ) : (
        <>
          <input
            className="recipe-list-search"
            type="text"
            placeholder={label === 'From' ? 'Item or #tag to replace' : 'Replacement item or #tag'}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {showDropdown && (
            <div className="bulk-replace-dropdown">
              {itemHits.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="bulk-replace-option"
                  onMouseDown={() => { onChange({ item: i.id, tag: false }); setQuery(''); setOpen(false); }}
                >
                  {getTextureUrl(i.id) ? (
                    <img src={getTextureUrl(i.id)!} alt="" className="bulk-replace-icon" />
                  ) : (
                    <span className="bulk-replace-option-fallback">•</span>
                  )}
                  <span className="bulk-replace-option-id">{i.id}</span>
                  <span className="bulk-replace-option-name">{i.name}</span>
                </button>
              ))}
              {tagHits.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="bulk-replace-option"
                  onMouseDown={() => { onChange({ item: t.id, tag: true }); setQuery(''); setOpen(false); }}
                >
                  <span className="bulk-replace-tag-glyph">#</span>
                  <span className="bulk-replace-option-id">{t.id}</span>
                  <span className="bulk-replace-option-name">{t.member_count} items</span>
                </button>
              ))}
              {rawUsable && !itemHits.some((i) => i.id === q) && !tagHits.some((t) => t.id === q) && (
                <button
                  type="button"
                  className="bulk-replace-option"
                  onMouseDown={() => {
                    onChange(isTagQuery ? { item: tagQ, tag: true } : { item: q, tag: false });
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <span className="bulk-replace-option-id">Use “{query.trim()}”</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BulkReplaceModal({
  recipes,
  selectedIds,
  items,
  tags,
  getTextureUrl,
  onClose,
  onApply,
}: BulkReplaceModalProps) {
  const [from, setFrom] = useState<IngredientRef | null>(null);
  const [to, setTo] = useState<IngredientRef | null>(null);

  const authoredIds = useMemo(
    () =>
      selectedIds.filter(
        (id) => recipes.find((r) => r.id === id)?.origin === 'authored',
      ),
    [recipes, selectedIds],
  );
  const skipped = selectedIds.length - authoredIds.length;

  const affected = useMemo(
    () => (from ? affectedRecipeIds(recipes, authoredIds, from) : []),
    [recipes, authoredIds, from],
  );
  const affectedNames = useMemo(
    () => affected.map((id) => recipes.find((r) => r.id === id)?.name ?? id),
    [recipes, affected],
  );

  const sameRef = from && to && refKey(from) === refKey(to);
  const canApply = !!from && !!to && !sameRef && affected.length > 0;

  return (
    <div className="item-picker-overlay">
      <div className="item-picker-backdrop" onClick={onClose} />
      <div className="item-picker-panel bulk-replace-panel">
        <div className="item-picker-header">
          <span className="item-picker-title">Replace ingredient…</span>
          <button className="item-picker-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        {skipped > 0 && (
          <div className="bulk-replace-note">
            {skipped} read-only skipped — use “Edit a copy” for those.
          </div>
        )}
        {authoredIds.length === 0 && (
          <div className="bulk-replace-note">No editable recipes selected.</div>
        )}

        <div className="bulk-replace-fields">
          <IngredientField
            items={items}
            tags={tags}
            getTextureUrl={getTextureUrl}
            label="From"
            value={from}
            onChange={setFrom}
          />
          <IngredientField
            items={items}
            tags={tags}
            getTextureUrl={getTextureUrl}
            label="To"
            value={to}
            onChange={setTo}
          />
        </div>

        <div className="bulk-replace-preview">
          {!from ? (
            <span className="bulk-replace-preview-empty">Pick a “From” ingredient to preview.</span>
          ) : affected.length === 0 ? (
            <span className="bulk-replace-preview-empty">
              No selected recipe uses {refKey(from)}.
            </span>
          ) : (
            <>
              <strong>{affected.length} {affected.length === 1 ? 'recipe will change' : 'recipes will change'}</strong>
              <ul className="bulk-replace-affected">
                {affectedNames.slice(0, 12).map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {affectedNames.length > 12 && (
                  <li>… and {affectedNames.length - 12} more</li>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="item-picker-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canApply}
            onClick={() => { if (from && to) onApply(from, to, affected); }}
          >
            Replace in {affected.length} recipe{affected.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkReplaceModal;
