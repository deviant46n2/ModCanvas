import { RecipeSlot } from './RecipeSlot'
import { OutputSlotField } from './OutputSlotField'
import { ArrowRightIcon } from '../ui/icons'
import type { RecipeIngredient, RecipeOutput } from '../../core/recipe/recipe-store'

interface RecipeGridProps {
  /** 3×3 grid of cells, owned by the parent editor. */
  cells: (RecipeIngredient | null)[][]
  shapeless: boolean
  instancePath: string
  getTextureUrl: (itemId: string) => string | null
  onCellChange: (row: number, col: number, ing: RecipeIngredient | null) => void
  onSetCount: (row: number, col: number, count: number) => void
  onRequestPick: (row: number, col: number) => void
  output: RecipeOutput
  onPickOutput: () => void
  onOutputChange: (output: RecipeOutput) => void
}

/** Stateless 3×3 crafting grid + arrow + output. The parent owns all cell
 *  state (`cells`) and writes through `onCellChange`; this component only
 *  renders. Cells use the MC-authentic `RecipeSlot` look. */
export function RecipeGrid({
  cells,
  shapeless,
  instancePath,
  getTextureUrl,
  onCellChange,
  onSetCount,
  onRequestPick,
  output,
  onPickOutput,
  onOutputChange,
}: RecipeGridProps) {
  return (
    <div className="recipe-grid">
      <div className="recipe-grid-matrix">
        {cells.map((row, ri) => (
          <div className="recipe-grid-row" key={ri}>
            {row.map((ing, ci) => (
              <RecipeSlot
                key={ci}
                ingredient={ing}
                shapeless={shapeless}
                instancePath={instancePath}
                getTextureUrl={getTextureUrl}
                onPick={() => onRequestPick(ri, ci)}
                onClear={() => onCellChange(ri, ci, null)}
                onDropIngredient={(next) => onCellChange(ri, ci, next)}
                onSetCount={(count) => onSetCount(ri, ci, count)}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="recipe-grid-arrow" aria-hidden="true">
        <ArrowRightIcon size={22} />
      </span>
      <OutputSlotField
        output={output}
        getTextureUrl={getTextureUrl}
        onPick={onPickOutput}
        onChange={onOutputChange}
      />
    </div>
  )
}

export default RecipeGrid
