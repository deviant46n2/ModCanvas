
import type { QuestObjectiveData } from '../../services/api'
import {
  OBJECTIVE_TYPES,
  isItemObjective, isFluidObjective, isEnergyObjective, isXpObjective,
  isEntityObjective, isLocationObjective, isCommandObjective,
  isAdvancementObjective, isStatObjective, isObservationObjective,
  isBiomeObjective, isStructureObjective,
} from './nodes'

interface ObjectivesTabProps {
  objectives: QuestObjectiveData[]
  onUpdate: (idx: number, field: string, value: unknown) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}

export function ObjectivesTab({ objectives, onUpdate, onRemove, onAdd }: ObjectivesTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="inspector-panel-section-title">Objectives ({objectives.length})</div>
      {objectives.map((obj, idx) => (
        <div key={obj.id} className="inspector-panel-card">
          <div className="inspector-panel-card-header">
            <span className="inspector-panel-card-index">#{idx + 1}</span>
            <button className="inspector-panel-card-remove" onClick={() => onRemove(idx)}>{'\u00D7'}</button>
          </div>
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Label</label>
            <input type="text" value={obj.label} onChange={(v) => onUpdate(idx, 'label', v.target.value)} />
          </div>
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Type</label>
            <select value={obj.objective_type} onChange={(v) => onUpdate(idx, 'objective_type', v.target.value)}>
              {OBJECTIVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {isItemObjective(obj.objective_type) && (
            <>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Target (item id / tag)</label>
                <input type="text" value={obj.target} onChange={(v) => onUpdate(idx, 'target', v.target.value)} placeholder="minecraft:diamond" />
              </div>
              <div className="inspector-panel-row">
                <div className="inspector-panel-field">
                  <label>Count</label>
                  <input type="number" value={obj.target_count} onChange={(v) => onUpdate(idx, 'target_count', Number(v.target.value))} />
                </div>
                <div className="inspector-panel-field">
                  <label className="inspector-panel-checkbox" style={{ marginTop: 20 }}>
                    <input type="checkbox" checked={obj.consume_items} onChange={(v) => onUpdate(idx, 'consume_items', v.target.checked)} />
                    Consume
                  </label>
                </div>
              </div>
            </>
          )}
          {isFluidObjective(obj.objective_type) && (
            <div className="inspector-panel-row">
              <div className="inspector-panel-field"><label>Fluid ID</label><input type="text" value={obj.fluid_id} onChange={(v) => onUpdate(idx, 'fluid_id', v.target.value)} /></div>
              <div className="inspector-panel-field"><label>Amount</label><input type="number" value={obj.fluid_amount} onChange={(v) => onUpdate(idx, 'fluid_amount', Number(v.target.value))} /></div>
            </div>
          )}
          {isEnergyObjective(obj.objective_type) && (
            <div className="inspector-panel-row">
              <div className="inspector-panel-field"><label>Energy</label><input type="number" value={obj.energy_amount} onChange={(v) => onUpdate(idx, 'energy_amount', Number(v.target.value))} /></div>
              <div className="inspector-panel-field"><label>Unit</label><input type="text" value={obj.energy_unit} onChange={(v) => onUpdate(idx, 'energy_unit', v.target.value)} /></div>
            </div>
          )}
          {isXpObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>XP Levels</label>
              <input type="number" value={obj.xp_levels} onChange={(v) => onUpdate(idx, 'xp_levels', Number(v.target.value))} />
            </div>
          )}
          {isEntityObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Entity ID</label>
              <input type="text" value={obj.entity_id} onChange={(v) => onUpdate(idx, 'entity_id', v.target.value)} placeholder="minecraft:zombie" />
            </div>
          )}
          {isLocationObjective(obj.objective_type) && (
            <div className="inspector-panel-row">
              <div className="inspector-panel-field"><label>X</label><input type="number" value={obj.x} onChange={(v) => onUpdate(idx, 'x', Number(v.target.value))} /></div>
              <div className="inspector-panel-field"><label>Y</label><input type="number" value={obj.y} onChange={(v) => onUpdate(idx, 'y', Number(v.target.value))} /></div>
              <div className="inspector-panel-field"><label>Z</label><input type="number" value={obj.z} onChange={(v) => onUpdate(idx, 'z', Number(v.target.value))} /></div>
            </div>
          )}
          {isCommandObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Command</label>
              <input type="text" value={obj.command} onChange={(v) => onUpdate(idx, 'command', v.target.value)} placeholder="/say hello" />
            </div>
          )}
          {isAdvancementObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Advancement ID</label>
              <input type="text" value={obj.advancement_id} onChange={(v) => onUpdate(idx, 'advancement_id', v.target.value)} placeholder="minecraft:adventure/root" />
            </div>
          )}
          {isStatObjective(obj.objective_type) && (
            <>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Statistic Name</label>
                <input type="text" value={obj.stat_name} onChange={(v) => onUpdate(idx, 'stat_name', v.target.value)} placeholder="minecraft:custom minecraft:distance_flown" />
              </div>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Required Value</label>
                <input type="number" value={obj.stat_value} onChange={(v) => onUpdate(idx, 'stat_value', Number(v.target.value))} />
              </div>
            </>
          )}
          {isObservationObjective(obj.objective_type) && (
            <>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Block/Entity to Observe</label>
                <input type="text" value={obj.target} onChange={(v) => onUpdate(idx, 'target', v.target.value)} placeholder="minecraft:enchanting_table" />
              </div>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Range (blocks)</label>
                <input type="number" step="0.5" value={obj.observation_range} onChange={(v) => onUpdate(idx, 'observation_range', Number(v.target.value))} />
              </div>
            </>
          )}
          {isBiomeObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Biome ID</label>
              <input type="text" value={obj.biome_id} onChange={(v) => onUpdate(idx, 'biome_id', v.target.value)} placeholder="minecraft:plains" />
            </div>
          )}
          {isStructureObjective(obj.objective_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Structure ID</label>
              <input type="text" value={obj.structure_id} onChange={(v) => onUpdate(idx, 'structure_id', v.target.value)} placeholder="minecraft:village/plains" />
            </div>
          )}
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Description</label>
            <input type="text" value={obj.description} onChange={(v) => onUpdate(idx, 'description', v.target.value)} />
          </div>
          <label className="inspector-panel-checkbox">
            <input type="checkbox" checked={obj.required} onChange={(v) => onUpdate(idx, 'required', v.target.checked)} />
            Required
          </label>
        </div>
      ))}
      <button className="inspector-panel-add-btn" onClick={onAdd}>+ Add Objective</button>
    </div>
  )
}
