import type { QuestNodeData } from '../../services/api'
import { ArrowRightIcon, BookIcon, InfoIcon, LockIcon, SquareIcon } from '../ui/icons'
import {
  SHAPES,
  VISIBILITY_OPTIONS,
  PROGRESSION_MODES,
  DEPENDENCY_REQUIREMENTS,
  questScaleFromSize,
  questSizeToPixels,
  setQuestScale,
} from './quest-form-constants'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { DetailSection } from './quest-detail-sections'

interface GroupProps {
  node: QuestNodeData
  onUpdateNode: (field: string, value: unknown) => void
  open: boolean
  onToggle: () => void
}

export function AppearanceSection({ node, onUpdateNode, open, onToggle, iconUrl, iconPending, onPickIcon }: GroupProps & {
  iconUrl?: string
  iconPending: boolean
  onPickIcon: () => void
}) {
  return (
    <DetailSection
      id="quest-section-appearance"
      title="Appearance"
      icon={<SquareIcon size={14} />}
      open={open}
      onToggle={onToggle}
    >
      <div className="quest-detail-field">
        <label>Scale</label>
        <div className="quest-detail-scale-control">
          <input
            type="range"
            min="0.5"
            max="4"
            step="0.1"
            value={questScaleFromSize(node.size)}
            onChange={(e) => onUpdateNode('size', setQuestScale(parseFloat(e.target.value)))}
          />
          <span className="quest-detail-scale-value">
            {questScaleFromSize(node.size)}x · {questSizeToPixels(node.size).width}×{questSizeToPixels(node.size).height}px
          </span>
        </div>
      </div>
      <div className="quest-detail-field-row">
        <div className="quest-detail-field">
          <label>Width</label>
          <input type="number" min="12" value={node.size?.width || 24} onChange={(e) => onUpdateNode('size', { width: parseInt(e.target.value) || 24, height: node.size?.height || 24 })} />
        </div>
        <div className="quest-detail-field">
          <label>Height</label>
          <input type="number" min="12" value={node.size?.height || 24} onChange={(e) => onUpdateNode('size', { width: node.size?.width || 24, height: parseInt(e.target.value) || 24 })} />
        </div>
        <div className="quest-detail-field">
          <label>Icon</label>
          <div className="quest-detail-icon-select">
            <div className="quest-detail-icon-preview">
              {iconUrl ? (
                <AnimatedSprite url={iconUrl} textureKey={node.icon || ''} width={28} height={28} alt="" />
              ) : iconPending ? (
                <QuestIcon pending url={null} fallback="" size={28} />
              ) : (
                <BookIcon size={20} />
              )}
            </div>
            <button className="quest-detail-small-btn" onClick={onPickIcon}>Change</button>
          </div>
        </div>
        <div className="quest-detail-field">
          <label>Color</label>
          <input type="color" value={node.color || '#60a5fa'} onChange={(e) => onUpdateNode('color', e.target.value)} />
        </div>
      </div>
      <div className="quest-detail-field-row">
        <div className="quest-detail-field">
          <label>Shape</label>
          <select value={node.shape} onChange={(e) => onUpdateNode('shape', e.target.value)}>
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="quest-detail-field">
          <label>Icon Scale</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="2.0"
            value={node.icon_scaling ?? 1.0}
            onChange={(e) => onUpdateNode('icon_scaling', parseFloat(e.target.value) || 1.0)}
          />
        </div>
      </div>
    </DetailSection>
  )
}

export function VisibilitySection({ node, onUpdateNode, open, onToggle }: GroupProps) {
  return (
    <DetailSection
      id="quest-section-visibility"
      title="Visibility"
      icon={<LockIcon size={14} />}
      open={open}
      onToggle={onToggle}
    >
      <div className="quest-detail-field-row">
        <div className="quest-detail-field">
          <label>Visibility</label>
          <select value={node.visibility} onChange={(e) => onUpdateNode('visibility', e.target.value)}>
            {VISIBILITY_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="quest-detail-field">
          <label>Min Width</label>
          <input type="number" value={node.min_window_width} onChange={(e) => onUpdateNode('min_window_width', parseInt(e.target.value) || 0)} />
        </div>
      </div>
      <div className="quest-detail-checkboxes">
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.hide_dependency_lines} onChange={(e) => onUpdateNode('hide_dependency_lines', e.target.checked)} />
          <span>Hide Dep Lines</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.hide_lock_icon} onChange={(e) => onUpdateNode('hide_lock_icon', e.target.checked)} />
          <span>Hide Lock Icon</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.hide_dependent_lines} onChange={(e) => onUpdateNode('hide_dependent_lines', e.target.checked)} />
          <span>Hide Dependent Lines</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.disable_jei_recipe} onChange={(e) => onUpdateNode('disable_jei_recipe', e.target.checked)} />
          <span>Hide JEI Recipe</span>
        </label>
      </div>
    </DetailSection>
  )
}

export function DependenciesSection({ node, onUpdateNode, open, onToggle }: GroupProps) {
  return (
    <DetailSection
      id="quest-section-dependencies"
      title="Dependencies"
      icon={<ArrowRightIcon size={14} />}
      open={open}
      onToggle={onToggle}
    >
      <div className="quest-detail-field-row">
        <div className="quest-detail-field">
          <label>Dependency Requirement</label>
          <select value={node.dependency_requirement || 'all_completed'} onChange={(e) => onUpdateNode('dependency_requirement', e.target.value)}>
            {DEPENDENCY_REQUIREMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div className="quest-detail-field">
          <label>Min Required Deps</label>
          <input type="number" min="0" value={node.min_required_dependencies} onChange={(e) => onUpdateNode('min_required_dependencies', parseInt(e.target.value) || 0)} />
        </div>
        <div className="quest-detail-field">
          <label>Max Completable Dependents</label>
          <input type="number" min="0" value={node.max_completable_dependents} onChange={(e) => onUpdateNode('max_completable_dependents', parseInt(e.target.value) || 0)} />
        </div>
      </div>
      <div className="quest-detail-checkboxes">
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.optional} onChange={(e) => onUpdateNode('optional', e.target.checked)} />
          <span>Optional</span>
        </label>
      </div>
    </DetailSection>
  )
}

export function MiscSection({ node, onUpdateNode, open, onToggle }: GroupProps) {
  return (
    <DetailSection
      id="quest-section-misc"
      title="Misc"
      icon={<InfoIcon size={14} />}
      open={open}
      onToggle={onToggle}
    >
      <div className="quest-detail-field-row">
        <div className="quest-detail-field">
          <label>Progression</label>
          <select value={node.progression_mode} onChange={(e) => onUpdateNode('progression_mode', e.target.value)}>
            {PROGRESSION_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="quest-detail-field">
          <label>Repeat Cooldown (s)</label>
          <input type="number" min="0" value={node.repeat_cooldown} onChange={(e) => onUpdateNode('repeat_cooldown', parseInt(e.target.value) || 0)} />
        </div>
        <div className="quest-detail-field quest-detail-field-guide">
          <label>Guide Page</label>
          <input type="text" value={node.guide_page || ''} onChange={(e) => onUpdateNode('guide_page', e.target.value)} placeholder="e.g. quests:guide/my_guide" />
        </div>
      </div>
      <div className="quest-detail-checkboxes">
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.can_be_repeatable} onChange={(e) => onUpdateNode('can_be_repeatable', e.target.checked)} />
          <span>Repeatable</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.silently_complete} onChange={(e) => onUpdateNode('silently_complete', e.target.checked)} />
          <span>Silently Complete</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.disable_completion_toast} onChange={(e) => onUpdateNode('disable_completion_toast', e.target.checked)} />
          <span>Disable Toast</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.disable_reward} onChange={(e) => onUpdateNode('disable_reward', e.target.checked)} />
          <span>Disable Reward</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.sequential_tasks} onChange={(e) => onUpdateNode('sequential_tasks', e.target.checked)} />
          <span>Sequential Tasks</span>
        </label>
        <label className="quest-detail-checkbox">
          <input type="checkbox" checked={node.ignore_reward_blocking} onChange={(e) => onUpdateNode('ignore_reward_blocking', e.target.checked)} />
          <span>Ignore Reward Blocking</span>
        </label>
      </div>
    </DetailSection>
  )
}
