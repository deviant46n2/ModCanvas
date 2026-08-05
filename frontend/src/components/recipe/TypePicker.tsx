import type { RecipeType } from '../../core/recipe/recipe-store';
import { TYPE_OPTIONS, TYPE_LABELS } from '../../core/recipe/type-picker';

function TypeGlyph({ cols, cells }: { cols: number; cells: number }) {
  const total = cols * 3;
  const boxes = Array.from({ length: total }, (_, i) => i < cells);
  return (
    <span
      className="recipe-type-glyph"
      style={{ gridTemplateColumns: `repeat(${cols}, 6px)` }}
    >
      {boxes.map((filled, i) => (
        <span key={i} className={filled ? 'glyph-cell filled' : 'glyph-cell'} />
      ))}
    </span>
  );
}

/** Non-destructive recipe-type picker: visual cards instead of a `<select>`.
 *  The caller confirms before switching when data would be discarded. */
export function TypePicker({
  value,
  onPick,
}: {
  value: RecipeType;
  onPick: (type: RecipeType) => void;
}) {
  return (
    <div className="recipe-type-picker" role="radiogroup" aria-label="Recipe type">
      {TYPE_OPTIONS.map((opt) => (
        <button
          key={opt.type}
          type="button"
          role="radio"
          aria-checked={value === opt.type}
          className={`recipe-type-card ${value === opt.type ? 'active' : ''}`}
          onClick={() => onPick(opt.type)}
          title={TYPE_LABELS[opt.type]}
        >
          <TypeGlyph cols={opt.cols} cells={opt.cells} />
          <span className="recipe-type-card-label">{TYPE_LABELS[opt.type]}</span>
        </button>
      ))}
    </div>
  );
}

export default TypePicker;
