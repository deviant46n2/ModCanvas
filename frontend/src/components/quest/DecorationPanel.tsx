import { useMemo, useState } from 'react';
import type { ChapterImage } from '../../services/api';
import {
  decorationCandidates,
  searchTextureCandidates,
} from './decoration-picker';
import { AnimatedSprite } from './AnimatedSprite';

interface DecorationPanelProps {
  textureIndex?: Record<string, string>;
  images: ChapterImage[];
  selectedIndex: number | null;
  onAddImage: (key: string) => void;
  onChangeImages: (images: ChapterImage[]) => void;
  /** Open the pack's user-writable texture folder (kubejs/assets) so a user
   *  can drop in their own PNGs and see them in the library (s49). */
  onOpenAssetsFolder: () => void;
}

const THUMB_LIMIT = 200;

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="quest-deco-field">
      <span>{label}</span>
      <input
        type="number"
        step={step ?? 0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

export function DecorationPanel({
  textureIndex,
  images,
  selectedIndex,
  onAddImage,
  onChangeImages,
  onOpenAssetsFolder,
}: DecorationPanelProps) {
  const [query, setQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const candidates = useMemo(() => {
    const index = textureIndex ?? {};
    return query
      ? searchTextureCandidates(index, query, THUMB_LIMIT)
      : decorationCandidates(index, THUMB_LIMIT);
  }, [textureIndex, query]);

  const selected = selectedIndex !== null ? images[selectedIndex] : null;

  const updateSelected = (patch: Partial<ChapterImage>) => {
    if (selectedIndex === null || !images[selectedIndex]) return;
    const next = images.map((img, i) => (i === selectedIndex ? { ...img, ...patch } : img));
    onChangeImages(next);
  };

  return (
    <div className="quest-deco-panel">
      <div className="quest-deco-panel-header">
        <strong>Decorations</strong>
        <button
          className="toolbar-btn"
          onClick={() => setShowPicker((s) => !s)}
          title="Add decoration from pack textures"
        >
          {showPicker ? 'Hide library' : '+ Library'}
        </button>
      </div>

      {showPicker && (
        <div className="quest-deco-library">
          <div className="quest-deco-library-header">
            <input
              className="quest-deco-search"
              placeholder="Search pack textures…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="toolbar-btn quest-deco-open-folder"
              onClick={onOpenAssetsFolder}
              title="Open the assets folder — drop PNGs in there to add them to this library"
            >
              Open folder
            </button>
          </div>
          <div className="quest-deco-thumb-grid">
            {candidates.map((c) => (
              <button
                key={c.key}
                className="quest-deco-thumb"
                title={c.key}
                onClick={() => onAddImage(c.key)}
              >
                <AnimatedSprite url={c.url} textureKey={c.key} width={16} height={16} alt={c.key} />
              </button>
            ))}
            {candidates.length === 0 && <span className="quest-deco-empty">No matches</span>}
          </div>
        </div>
      )}

      {selected && (
        <div className="quest-deco-inspector">
          <label className="quest-deco-field quest-deco-field-wide">
            <span>Image</span>
            <input
              value={selected.image}
              onChange={(e) => updateSelected({ image: e.target.value })}
            />
          </label>
          <div className="quest-deco-field-row">
            <NumberField label="X" value={selected.x} onChange={(v) => updateSelected({ x: v })} />
            <NumberField label="Y" value={selected.y} onChange={(v) => updateSelected({ y: v })} />
            <NumberField label="W" value={selected.width} onChange={(v) => updateSelected({ width: v })} />
            <NumberField label="H" value={selected.height} onChange={(v) => updateSelected({ height: v })} />
          </div>
          <div className="quest-deco-field-row">
            <NumberField
              label="Rot"
              value={selected.rotation}
              onChange={(v) => updateSelected({ rotation: v })}
            />
            <NumberField
              label="Alpha"
              value={selected.alpha ?? 255}
              step={1}
              onChange={(v) => updateSelected({ alpha: Math.max(0, Math.min(255, Math.round(v))) })}
            />
            <NumberField
              label="Order"
              value={selected.order}
              step={1}
              onChange={(v) => updateSelected({ order: Math.round(v) })}
            />
          </div>
          <button
            className="quest-deco-remove"
            onClick={() => {
              onChangeImages(images.filter((_, i) => i !== selectedIndex));
            }}
          >
            Remove decoration
          </button>
        </div>
      )}

      {images.length === 0 && !showPicker && (
        <div className="quest-deco-empty">
          No decorations on this chapter — open the library to add some.
        </div>
      )}
    </div>
  );
}
