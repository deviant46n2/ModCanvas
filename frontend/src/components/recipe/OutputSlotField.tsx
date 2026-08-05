import { AnimatedSprite } from '../quest/AnimatedSprite'
import type { RecipeOutput } from '../../core/recipe/recipe-store'

interface OutputSlotFieldProps {
  output: RecipeOutput
  getTextureUrl: (itemId: string) => string | null
  onPick: () => void
  onChange: (output: RecipeOutput) => void
}

/** Output cell + text/count editors for the crafting grid panel. The slot uses
 *  the same MC bevel as `RecipeSlot`; specialized editors adopt this shared
 *  field in a later pass. */
export function OutputSlotField({ output, getTextureUrl, onPick, onChange }: OutputSlotFieldProps) {
  const url = getTextureUrl(output.item)
  return (
    <div className="output-slot-field">
      <div
        className={`recipe-slot is-filled ${output.item ? '' : 'is-empty'}`}
        onClick={onPick}
        title={output.item ? output.item : 'Click to pick the output'}
      >
        {url && <AnimatedSprite url={url} textureKey={output.item} width={32} height={32} alt="" />}
        {!url && <span className="recipe-slot-fallback">?</span>}
        {output.count > 1 && <span className="recipe-slot-count">{output.count}</span>}
      </div>
      <div className="output-slot-fields">
        <input
          type="text"
          placeholder="Output item ID"
          value={output.item}
          onChange={(e) => onChange({ ...output, item: e.target.value })}
          className="output-item-input"
        />
        <div className="output-count-wrap">
          <label htmlFor="output-count">Count</label>
          <input
            id="output-count"
            type="number"
            min="1"
            max="64"
            value={output.count}
            onChange={(e) => onChange({ ...output, count: parseInt(e.target.value) || 1 })}
            className="output-count-input"
          />
        </div>
      </div>
    </div>
  )
}

export default OutputSlotField
