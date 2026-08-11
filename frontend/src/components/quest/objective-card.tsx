import type { QuestObjectiveData } from '../../services/api'
import { ArrowDownIcon, ArrowUpIcon, XIcon } from '../ui/icons'
import { OBJECTIVE_TYPES } from './quest-form-constants'
import { QuestSlotIcon } from './quest-slot-icon'
import { QuestSelect } from './QuestSelect'
import { objectiveEditorFor } from './objective-editors'

export function ObjectiveCard({
  obj,
  index,
  textureIndex,
  onRemove,
  onUpdate,
  onOpenItemPicker,
  onMoveUp,
  onMoveDown,
}: {
  obj: QuestObjectiveData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  // Each objective type renders its own fields via the editor registry; a
  // type with no extra fields (checkmark/custom) renders none. The card
  // itself is just the shell + the shared required toggle.
  const Editor = objectiveEditorFor(obj.objective_type)

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <QuestSlotIcon
            target={obj.target || obj.fluid_id}
            smartFilter={obj.smart_filter}
            objectiveType={obj.objective_type}
            textureIndex={textureIndex}
            size={24}
            className="quest-detail-task-icon"
            onClick={onOpenItemPicker}
            title={onOpenItemPicker ? 'Click to pick item' : undefined}
          />
          <span className="quest-detail-card-index">#{index + 1}</span>
          <QuestSelect
            value={obj.objective_type}
            onChange={(v) => onUpdate('objective_type', v)}
            ariaLabel="Objective type"
            options={OBJECTIVE_TYPES}
            className="quest-detail-card-type-select"
          />
        </div>
        <div className="quest-detail-card-reorder">
          <button className="quest-detail-card-reorder-btn" onClick={onMoveUp} disabled={!onMoveUp} title="Move up"><ArrowUpIcon size={12} /></button>
          <button className="quest-detail-card-reorder-btn" onClick={onMoveDown} disabled={!onMoveDown} title="Move down"><ArrowDownIcon size={12} /></button>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove"><XIcon size={12} /></button>
      </div>
      <div className="quest-detail-card-body">
        {Editor ? (
          <Editor obj={obj} onUpdate={onUpdate} onOpenItemPicker={onOpenItemPicker} />
        ) : (
          <div className="quest-detail-empty">No extra options for this type.</div>
        )}
        <label className="quest-detail-checkbox" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={obj.required} onChange={(e) => onUpdate('required', e.target.checked)} />
          <span>Required</span>
        </label>
      </div>
    </div>
  )
}
