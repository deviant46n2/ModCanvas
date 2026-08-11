// GuidedQuestWizard — the P0-MINIWIZ "Add a quest" surface (roadmap §9.5).
//
// A three-step, task-scoped guide over the quest editor: pick an item → pick
// a goal (collect N of it) → review + create. It collects a spec and hands it
// to onCreate — it never touches the graph or history itself. The quest lands
// in the editor through the same commitGraph path (undoable in one step) and
// the same export path (real SNBT). No parallel generation paths.
import { useState } from 'react'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import { ItemBrowser, type RecipePickValue } from '../recipe/ItemBrowser'
import './guided-quest-wizard.css'

export interface GuidedQuestSpec {
  /** Human title for the quest node (user-edited). */
  title: string
  /** FTB objective type — item-family only for now (task-scoped). */
  objectiveType: string
  /** Picked item id (e.g. "minecraft:diamond"). */
  target: string
  /** How many to collect. */
  count: number
  /** Item id for the reward (the collected item itself). */
  rewardItem: string
  /** How many to hand back. */
  rewardCount: number
  /** When true the quest gets a collect-N-get-N reward. */
  includeReward: boolean
}

interface GuidedQuestWizardProps {
  open: boolean
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getPickerTextureUrl: (itemId: string) => string | null
  onClose: () => void
  /** Fire the quest creation through the editor's own graph/history path. */
  onCreate: (spec: GuidedQuestSpec) => void
}

const GOALS = [
  { value: 'item_acquisition', label: 'Collect', hint: 'The player must get N of the item' },
  { value: 'craft', label: 'Craft', hint: 'The player must craft it (tracked via crafting)' },
] as const

export function GuidedQuestWizard({ open, items, tags, getPickerTextureUrl, onClose, onCreate }: GuidedQuestWizardProps) {
  const [step, setStep] = useState(1)
  const [pick, setPick] = useState<RecipePickValue | null>(null)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState<string>('item_acquisition')
  const [count, setCount] = useState(1)
  const [includeReward, setIncludeReward] = useState(true)

  if (!open) return null

  const humanName = (id: string) => {
    const entry = items.find((i) => i.id === id)
    return entry?.name || id.split(':').pop() || id
  }

  const derivedTitle = pick ? `Collect ${count} ${humanName(pick.item)}` : 'New Quest'

  const handleItemSelect = (value: RecipePickValue) => {
    setPick(value)
    setStep(2)
  }

  const reset = () => {
    setStep(1)
    setPick(null)
    setTitle('')
    setGoal('item_acquisition')
    setCount(1)
    setIncludeReward(true)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = () => {
    if (!pick) return
    onCreate({
      title: title.trim() || derivedTitle,
      objectiveType: goal,
      target: pick.item,
      count,
      rewardItem: pick.item,
      rewardCount: count,
      includeReward,
    })
    reset()
    onClose()
  }

  return (
    <div className="guided-wizard-overlay" onClick={handleClose}>
      <div className="guided-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="guided-wizard-header">
          <strong>Add a quest</strong>
          <span>Step {step} of 3</span>
          <button className="guided-wizard-close" onClick={handleClose} aria-label="Close">×</button>
        </div>

        {step === 1 && (
          <div className="guided-wizard-step">
            <p className="guided-wizard-hint">Pick the item this quest is about.</p>
            <ItemBrowser
              items={items}
              tags={tags}
              getTextureUrl={getPickerTextureUrl}
              mode="pick"
              onSelect={handleItemSelect}
              allowTags={false}
            />
          </div>
        )}

        {step === 2 && pick && (
          <div className="guided-wizard-step">
            <p className="guided-wizard-hint">
              Goal: <strong>{humanName(pick.item)}</strong>
            </p>
            <div className="guided-wizard-field">
              <label>What must the player do?</label>
              {GOALS.map((g) => (
                <label key={g.value} className="guided-wizard-radio">
                  <input type="radio" name="goal" checked={goal === g.value} onChange={() => setGoal(g.value)} />
                  <span>
                    <strong>{g.label}</strong>
                    <em>{g.hint}</em>
                  </span>
                </label>
              ))}
            </div>
            <div className="guided-wizard-field">
              <label>How many?</label>
              <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div className="guided-wizard-field">
              <label>Quest title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={derivedTitle} />
            </div>
          </div>
        )}

        {step === 3 && pick && (
          <div className="guided-wizard-step">
            <p className="guided-wizard-hint">Ready to add this quest to <strong>{'your quest book'}</strong>.</p>
            <div className="guided-wizard-review">
              <div><span>Title</span><strong>{title.trim() || derivedTitle}</strong></div>
              <div><span>Goal</span><strong>{GOALS.find((g) => g.value === goal)?.label} {count} × {humanName(pick.item)}</strong></div>
              <div><span>Reward</span><strong>{count} × {humanName(pick.item)}</strong></div>
            </div>
            <label className="guided-wizard-checkbox">
              <input type="checkbox" checked={includeReward} onChange={(e) => setIncludeReward(e.target.checked)} />
              <span>Reward the item back (collect-N-get-N)</span>
            </label>
          </div>
        )}

        <div className="guided-wizard-actions">
          {step > 1 && <button className="btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
          {step === 2 && <button className="btn-primary" onClick={() => setStep(3)}>Review</button>}
          {step === 3 && <button className="btn-primary" onClick={handleCreate}>Add quest</button>}
        </div>
      </div>
    </div>
  )
}
