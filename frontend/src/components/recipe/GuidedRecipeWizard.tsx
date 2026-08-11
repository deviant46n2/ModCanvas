// GuidedRecipeWizard — the P0-MINIWIZ "Add a recipe" surface (roadmap §9.5).
//
// A three-step, task-scoped guide over the recipe editor: pick the output →
// set the count + pick ingredients → review + create. It collects a spec and
// hands it to onCreate — it never touches the store itself. The recipe lands
// through the same addRecipe path as the editor's own "New Recipe" button
// (undoable via the recipe store) and saves through the normal authored-only
// path. No parallel generation.
import { useState } from 'react'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import { ItemBrowser, type RecipePickValue } from './ItemBrowser'
import { validateRecipe } from '../../core/recipe/validation'
import type { Recipe } from '../../core/recipe/recipe-store'
import './guided-recipe-wizard.css'

export interface GuidedRecipeSpec {
  /** Output item id. */
  output: string
  /** How many the recipe produces. */
  outputCount: number
  /** Ingredients (item ids, each with a count). */
  ingredients: Array<{ item: string; count: number }>
}

interface GuidedRecipeWizardProps {
  open: boolean
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getTextureUrl: (itemId: string) => string | null
  onClose: () => void
  /** Fire the recipe creation through the editor's own store path. */
  onCreate: (spec: GuidedRecipeSpec) => void
}

const MAX_INGREDIENTS = 9

export function GuidedRecipeWizard({ open, items, tags, getTextureUrl, onClose, onCreate }: GuidedRecipeWizardProps) {
  const [step, setStep] = useState(1)
  const [output, setOutput] = useState<RecipePickValue | null>(null)
  const [outputCount, setOutputCount] = useState(1)
  const [ingredients, setIngredients] = useState<Array<{ item: string; count: number }>>([])

  if (!open) return null

  const humanName = (id: string) => {
    const entry = items.find((i) => i.id === id)
    return entry?.name || id.split(':').pop() || id
  }

  const hasIngredients = ingredients.length > 0
  const canAddIngredient = ingredients.length < MAX_INGREDIENTS

  // Live validation mirrors the editor: the wizard never creates a recipe the
  // editor would refuse to save (roadmap §9.5: "validates via validation.ts").
  const draft: Recipe = {
    id: 'draft',
    type: 'shapeless',
    name: 'New Recipe',
    ingredients: ingredients.map((i) => ({ item: i.item, count: i.count })),
    output: { item: output?.item ?? '', count: outputCount },
  }
  const blocking = output ? validateRecipe(draft).filter((i) => i.severity === 'error') : []

  const reset = () => {
    setStep(1)
    setOutput(null)
    setOutputCount(1)
    setIngredients([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleAddIngredient = (value: RecipePickValue) => {
    if (ingredients.some((i) => i.item === value.item)) return
    setIngredients((prev) => [...prev, { item: value.item, count: 1 }])
  }

  const handleCreate = () => {
    if (!output || blocking.length > 0) return
    onCreate({
      output: output.item,
      outputCount,
      ingredients,
    })
    reset()
    onClose()
  }

  return (
    <div className="guided-recipe-overlay" onClick={handleClose}>
      <div className="guided-recipe" onClick={(e) => e.stopPropagation()}>
        <div className="guided-recipe-header">
          <strong>Add a recipe</strong>
          <span>Step {step} of 3</span>
          <button className="guided-recipe-close" onClick={handleClose} aria-label="Close">×</button>
        </div>

        {step === 1 && (
          <div className="guided-recipe-step">
            <p className="guided-recipe-hint">What does this recipe make? Pick the output item.</p>
            <ItemBrowser
              items={items}
              tags={tags}
              getTextureUrl={getTextureUrl}
              mode="pick"
              onSelect={(v) => {
                setOutput(v)
                setStep(2)
              }}
              allowTags={false}
            />
          </div>
        )}

        {step === 2 && output && (
          <div className="guided-recipe-step">
            <p className="guided-recipe-hint">
              Output: <strong>{humanName(output.item)}</strong> — now pick what goes in.
            </p>
            <div className="guided-recipe-field">
              <label>How many does it produce?</label>
              <input
                type="number"
                min={1}
                max={64}
                value={outputCount}
                onChange={(e) => setOutputCount(Math.max(1, Math.min(64, parseInt(e.target.value) || 1)))}
              />
            </div>

            {ingredients.length > 0 && (
              <div className="guided-recipe-ingredients">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="guided-recipe-ingredient">
                    <span>{humanName(ing.item)}</span>
                    <input
                      type="number"
                      min={1}
                      value={ing.count}
                      onChange={(e) => {
                        const count = Math.max(1, parseInt(e.target.value) || 1)
                        setIngredients((prev) => prev.map((p, i) => (i === idx ? { ...p, count } : p)))
                      }}
                    />
                    <button
                      className="guided-recipe-remove"
                      onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Remove ${humanName(ing.item)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canAddIngredient ? (
              <div className="guided-recipe-browser">
                <ItemBrowser
                  items={items}
                  tags={tags}
                  getTextureUrl={getTextureUrl}
                  mode="pick"
                  onSelect={handleAddIngredient}
                  allowTags={false}
                />
              </div>
            ) : (
              <p className="guided-recipe-hint">All {MAX_INGREDIENTS} slots used.</p>
            )}
          </div>
        )}

        {step === 3 && output && (
          <div className="guided-recipe-step">
            <p className="guided-recipe-hint">Ready to add this recipe.</p>
            <div className="guided-recipe-review">
              <div><span>Makes</span><strong>{outputCount} × {humanName(output.item)}</strong></div>
              <div><span>From</span><strong>{ingredients.map((i) => `${i.count} × ${humanName(i.item)}`).join(', ') || '—'}</strong></div>
            </div>
            {blocking.length > 0 && (
              <div className="guided-recipe-errors">
                {blocking.map((b, i) => (
                  <div key={i}>{b.message}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="guided-recipe-actions">
          {step > 1 && <button className="btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
          {step === 2 && (
            <button className="btn-primary" onClick={() => setStep(3)} disabled={!hasIngredients}>
              Review
            </button>
          )}
          {step === 3 && (
            <button className="btn-primary" onClick={handleCreate} disabled={blocking.length > 0}>
              Add recipe
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
