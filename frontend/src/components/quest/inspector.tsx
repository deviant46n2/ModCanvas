
import type { Node } from '@xyflow/react'
import type { QuestObjectiveData, QuestRewardData } from '../../services/api'
import {
  VISIBILITY_OPTIONS, SHAPES, PROGRESSION_MODES, DEPENDENCY_REQUIREMENTS,
} from './nodes'
import { ObjectivesTab } from './ObjectivesTab'
import { RewardsTab } from './RewardsTab'

interface EditState {
  label: string; setLabel: (v: string) => void
  desc: string; setDesc: (v: string) => void
  subtitle: string; setSubtitle: (v: string) => void
  color: string; setColor: (v: string) => void
  visibility: string; setVisibility: (v: string) => void
  optional: boolean; setOptional: (v: boolean) => void
  icon: string; setIcon: (v: string) => void
  repeatable: boolean; setRepeatable: (v: boolean) => void
  silentComplete: boolean; setSilentComplete: (v: boolean) => void
  repeatTime: number; setRepeatTime: (v: number) => void
  repeatMinDelay: number; setRepeatMinDelay: (v: number) => void
  repeatMaxDelay: number; setRepeatMaxDelay: (v: number) => void
  hideDeps: boolean; setHideDeps: (v: boolean) => void
  hideQuest: boolean; setHideQuest: (v: boolean) => void
  hideAll: boolean; setHideAll: (v: boolean) => void
  disableReward: boolean; setDisableReward: (v: boolean) => void
  pauseReward: boolean; setPauseReward: (v: boolean) => void
  shape: string; setShape: (v: string) => void
  iconScaling: number; setIconScaling: (v: number) => void
  tags: string; setTags: (v: string) => void
  progressionMode: string; setProgressionMode: (v: string) => void
  sequentialTasks: boolean; setSequentialTasks: (v: boolean) => void
  disableToast: boolean; setDisableToast: (v: boolean) => void
  ignoreRewardBlocking: boolean; setIgnoreRewardBlocking: (v: boolean) => void
  disableJei: boolean; setDisableJei: (v: boolean) => void
  hideDetailsUntilStartable: boolean; setHideDetailsUntilStartable: (v: boolean) => void
  hideTextUntilCompleted: boolean; setHideTextUntilCompleted: (v: boolean) => void
  invisibleUntilCompleted: boolean; setInvisibleUntilCompleted: (v: boolean) => void
  invisibleUntilXTasks: number; setInvisibleUntilXTasks: (v: number) => void
  hideDepLines: boolean; setHideDepLines: (v: boolean) => void
  hideDeptLines: boolean; setHideDeptLines: (v: boolean) => void
  minReqDeps: number; setMinReqDeps: (v: number) => void
  depRequirement: string; setDepRequirement: (v: string) => void
}

interface InspectorSectionProps {
  selectedNode: Node | null
  selectedNodeType: string
  selectedLabel: string
  selectedIconDataUrl: string
  isQuestSelected: boolean
  selectedFallbackIcon: string
  inspectorTab: string
  setInspectorTab: (tab: string) => void
  deselectNode: () => void
  deleteSelectedNode: () => void
  openIconPicker: () => void
  liveSaveField: (field: string, value: unknown) => void
  edit: EditState
  inspectorObjectives: QuestObjectiveData[]
  inspectorRewards: QuestRewardData[]
  updateInspectorObjective: (idx: number, field: string, value: unknown) => void
  removeInspectorObjective: (idx: number) => void
  addInspectorObjective: () => void
  updateInspectorReward: (idx: number, field: string, value: unknown) => void
  removeInspectorReward: (idx: number) => void
  addInspectorReward: () => void
  textureIndex: Record<string, string>
}

export function InspectorSection({
  selectedNode, selectedNodeType, selectedLabel, selectedIconDataUrl,
  isQuestSelected, selectedFallbackIcon, inspectorTab, setInspectorTab,
  deselectNode, deleteSelectedNode, openIconPicker, liveSaveField,
  edit: e, inspectorObjectives, inspectorRewards,
  updateInspectorObjective, removeInspectorObjective, addInspectorObjective,
  updateInspectorReward, removeInspectorReward, addInspectorReward,
  textureIndex,
}: InspectorSectionProps) {
  if (!selectedNode) {
    return (
      <div className="quest-editor-inspector">
        <div className="inspector-panel-empty">
          <div className="inspector-panel-empty-icon">{'\u{1F4DC}'}</div>
          <div>Select a quest to edit</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Right-click canvas to create, or use + Add Quest</div>
        </div>
      </div>
    )
  }

  return (
    <div className="quest-editor-inspector">
      <div className="inspector-panel-header">
        <div className="inspector-panel-header-left">
          <div className="inspector-panel-icon">
            {selectedIconDataUrl ? (
              <img src={selectedIconDataUrl} alt="" style={{ width: 24, height: 24, imageRendering: 'pixelated' }} />
            ) : (
              <span style={{ fontSize: 16 }}>{selectedFallbackIcon}</span>
            )}
          </div>
          <div>
            <div className="inspector-panel-title">{selectedLabel}</div>
            <div className="inspector-panel-subtitle">{selectedNodeType.replace('_', ' ')}</div>
          </div>
        </div>
        <button className="inspector-panel-close" onClick={deselectNode}>{'\u00D7'}</button>
      </div>

      <div className="inspector-panel-tabs">
        <button className={`inspector-panel-tab ${inspectorTab === 'general' ? 'active' : ''}`} onClick={() => setInspectorTab('general')}>General</button>
        {isQuestSelected && <button className={`inspector-panel-tab ${inspectorTab === 'objectives' ? 'active' : ''}`} onClick={() => setInspectorTab('objectives')}>Objectives</button>}
        {isQuestSelected && <button className={`inspector-panel-tab ${inspectorTab === 'rewards' ? 'active' : ''}`} onClick={() => setInspectorTab('rewards')}>Rewards</button>}
        <button className={`inspector-panel-tab ${inspectorTab === 'advanced' ? 'active' : ''}`} onClick={() => setInspectorTab('advanced')}>Advanced</button>
      </div>

      <div className="inspector-panel-body">
        {inspectorTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="inspector-panel-field">
              <label>Label</label>
              <input type="text" value={e.label} onChange={(v) => { e.setLabel(v.target.value); liveSaveField('label', v.target.value) }} />
            </div>
            <div className="inspector-panel-field">
              <label>Description</label>
              <textarea value={e.desc} onChange={(v) => { e.setDesc(v.target.value); liveSaveField('description', v.target.value) }} rows={3} />
            </div>
            <div className="inspector-panel-field">
              <label>Subtitle</label>
              <input type="text" value={e.subtitle} onChange={(v) => { e.setSubtitle(v.target.value); liveSaveField('subtitle', v.target.value) }} />
            </div>
            <div className="inspector-panel-row">
              <div className="inspector-panel-field">
                <label>Color</label>
                <input type="color" value={e.color || '#3b82f6'} onChange={(v) => { e.setColor(v.target.value); liveSaveField('color', v.target.value) }} style={{ height: 34, padding: '2px 4px' }} />
              </div>
              <div className="inspector-panel-field">
                <label>Icon (item id)</label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="text" value={e.icon} onChange={(v) => { e.setIcon(v.target.value); liveSaveField('icon', v.target.value) }} placeholder="minecraft:diamond" style={{ flex: 1 }} />
                  <button className="ftb-popup-btn" onClick={openIconPicker} style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11 }}>Browse</button>
                </div>
                {e.icon && textureIndex[e.icon] && (
                  <div style={{ marginTop: 4 }}>
                    <img src={textureIndex[e.icon]} alt={e.icon} style={{ width: 32, height: 32, imageRendering: 'pixelated', borderRadius: 4, background: '#11111b', padding: 2 }} />
                  </div>
                )}
              </div>
            </div>
            <div className="inspector-panel-field">
              <label>Visibility</label>
              <select value={e.visibility} onChange={(v) => { e.setVisibility(v.target.value); liveSaveField('visibility', v.target.value) }}>
                {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <label className="inspector-panel-checkbox">
              <input type="checkbox" checked={e.optional} onChange={(v) => { e.setOptional(v.target.checked); liveSaveField('optional', v.target.checked) }} />
              Optional
            </label>
          </div>
        )}

        {inspectorTab === 'objectives' && isQuestSelected && (
          <ObjectivesTab
            objectives={inspectorObjectives}
            onUpdate={updateInspectorObjective}
            onRemove={removeInspectorObjective}
            onAdd={addInspectorObjective}
          />
        )}

        {inspectorTab === 'rewards' && isQuestSelected && (
          <RewardsTab
            rewards={inspectorRewards}
            onUpdate={updateInspectorReward}
            onRemove={removeInspectorReward}
            onAdd={addInspectorReward}
          />
        )}

        {inspectorTab === 'advanced' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="inspector-panel-section-title">Behavior</div>
            <label className="inspector-panel-checkbox">
              <input type="checkbox" checked={e.repeatable} onChange={(v) => { e.setRepeatable(v.target.checked); liveSaveField('can_be_repeatable', v.target.checked) }} />
              Repeatable
            </label>
            {e.repeatable && (
              <div className="inspector-panel-row">
                <div className="inspector-panel-field"><label>Repeat Time</label><input type="number" value={e.repeatTime} onChange={(v) => { e.setRepeatTime(Number(v.target.value)); liveSaveField('repeat_time', Number(v.target.value)) }} /></div>
                <div className="inspector-panel-field"><label>Min Delay</label><input type="number" value={e.repeatMinDelay} onChange={(v) => { e.setRepeatMinDelay(Number(v.target.value)); liveSaveField('repeat_min_delay', Number(v.target.value)) }} /></div>
                <div className="inspector-panel-field"><label>Max Delay</label><input type="number" value={e.repeatMaxDelay} onChange={(v) => { e.setRepeatMaxDelay(Number(v.target.value)); liveSaveField('repeat_max_delay', Number(v.target.value)) }} /></div>
              </div>
            )}
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.silentComplete} onChange={(v) => { e.setSilentComplete(v.target.checked); liveSaveField('silently_complete', v.target.checked) }} /> Silent Complete</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideDeps} onChange={(v) => { e.setHideDeps(v.target.checked); liveSaveField('hide_quest_until_deps_complete', v.target.checked) }} /> Hide Until Deps Done</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideQuest} onChange={(v) => { e.setHideQuest(v.target.checked); liveSaveField('hide_quest_until_quest_complete', v.target.checked) }} /> Hide Until Quest Done</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideAll} onChange={(v) => { e.setHideAll(v.target.checked); liveSaveField('hide_quest_until_all_complete', v.target.checked) }} /> Hide Until All Done</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.disableReward} onChange={(v) => { e.setDisableReward(v.target.checked); liveSaveField('disable_reward', v.target.checked) }} /> Disable Reward</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.pauseReward} onChange={(v) => { e.setPauseReward(v.target.checked); liveSaveField('pause_reward', v.target.checked) }} /> Pause Reward</label>

            <div className="inspector-panel-section-title">Appearance</div>
            <div className="inspector-panel-row">
              <div className="inspector-panel-field">
                <label>Shape</label>
                <select value={e.shape} onChange={(v) => { e.setShape(v.target.value); liveSaveField('shape', v.target.value) }}>
                  {SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="inspector-panel-field">
                <label>Icon Scaling</label>
                <input type="number" step="0.1" min="0.1" max="10" value={e.iconScaling} onChange={(v) => { e.setIconScaling(Number(v.target.value)); liveSaveField('icon_scaling', Number(v.target.value)) }} />
              </div>
            </div>
            <div className="inspector-panel-field">
              <label>Tags (comma-separated)</label>
              <input type="text" value={e.tags} onChange={(v) => { e.setTags(v.target.value); liveSaveField('tags', v.target.value.split(',').map((t: string) => t.trim()).filter(Boolean)) }} placeholder="tutorial, early-game" />
            </div>

            <div className="inspector-panel-section-title">Progression</div>
            <div className="inspector-panel-field">
              <label>Progression Mode</label>
              <select value={e.progressionMode} onChange={(v) => { e.setProgressionMode(v.target.value); liveSaveField('progression_mode', v.target.value) }}>
                {PROGRESSION_MODES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.sequentialTasks} onChange={(v) => { e.setSequentialTasks(v.target.checked); liveSaveField('sequential_tasks', v.target.checked) }} /> Sequential Tasks</label>

            <div className="inspector-panel-section-title">Misc</div>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.disableToast} onChange={(v) => { e.setDisableToast(v.target.checked); liveSaveField('disable_completion_toast', v.target.checked) }} /> Disable Completion Toast</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.ignoreRewardBlocking} onChange={(v) => { e.setIgnoreRewardBlocking(v.target.checked); liveSaveField('ignore_reward_blocking', v.target.checked) }} /> Ignore Reward Blocking</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.disableJei} onChange={(v) => { e.setDisableJei(v.target.checked); liveSaveField('disable_jei_recipe', v.target.checked) }} /> Disable JEI Recipe</label>

            <div className="inspector-panel-section-title">Visibility Advanced</div>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideDetailsUntilStartable} onChange={(v) => { e.setHideDetailsUntilStartable(v.target.checked); liveSaveField('hide_details_until_startable', v.target.checked) }} /> Hide Details Until Startable</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideTextUntilCompleted} onChange={(v) => { e.setHideTextUntilCompleted(v.target.checked); liveSaveField('hide_text_until_completed', v.target.checked) }} /> Hide Text Until Completed</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.invisibleUntilCompleted} onChange={(v) => { e.setInvisibleUntilCompleted(v.target.checked); liveSaveField('invisible_until_completed', v.target.checked) }} /> Invisible Until Completed</label>
            <div className="inspector-panel-field">
              <label>Invisible Until X Tasks Done</label>
              <input type="number" value={e.invisibleUntilXTasks} onChange={(v) => { e.setInvisibleUntilXTasks(Number(v.target.value)); liveSaveField('invisible_until_x_tasks', Number(v.target.value)) }} />
            </div>

            <div className="inspector-panel-section-title">Dependencies</div>
            <div className="inspector-panel-field">
              <label>Dependency Requirement</label>
              <select value={e.depRequirement} onChange={(v) => { e.setDepRequirement(v.target.value); liveSaveField('dependency_requirement', v.target.value) }}>
                {DEPENDENCY_REQUIREMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="inspector-panel-field">
              <label>Min Required Dependencies</label>
              <input type="number" min="0" value={e.minReqDeps} onChange={(v) => { e.setMinReqDeps(Number(v.target.value)); liveSaveField('min_required_dependencies', Number(v.target.value)) }} />
            </div>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideDepLines} onChange={(v) => { e.setHideDepLines(v.target.checked); liveSaveField('hide_dependency_lines', v.target.checked) }} /> Hide Dependency Lines</label>
            <label className="inspector-panel-checkbox"><input type="checkbox" checked={e.hideDeptLines} onChange={(v) => { e.setHideDeptLines(v.target.checked); liveSaveField('hide_dependent_lines', v.target.checked) }} /> Hide Dependent Lines</label>
          </div>
        )}
      </div>

      <div className="inspector-panel-delete">
        <button className="inspector-panel-delete-btn" onClick={deleteSelectedNode}>Delete Quest</button>
      </div>
    </div>
  )
}
