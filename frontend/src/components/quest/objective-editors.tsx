import type { ComponentType } from 'react'
import type { QuestObjectiveData } from '../../services/api'
import { PackageIcon } from '../ui/icons'

/** Props every objective-type editor receives from ObjectiveCard. */
export interface ObjectiveEditorProps {
  obj: QuestObjectiveData
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="quest-detail-field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="quest-detail-field-row">{children}</div>
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="quest-detail-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

/** Item-family types share the target + count + NBT/task checkboxes. */
function ItemFamilyEditor({ obj, onUpdate, onOpenItemPicker }: ObjectiveEditorProps) {
  return (
    <>
      <Row>
        <Field label="Target">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} placeholder="e.g. minecraft:diamond" style={{ flex: 1 }} />
            <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}><PackageIcon size={12} /></button>
          </div>
        </Field>
        <Field label="Count">
          <input type="number" value={obj.target_count} onChange={(e) => onUpdate('target_count', parseInt(e.target.value) || 1)} />
        </Field>
      </Row>
      <div className="quest-detail-checkboxes">
        <Checkbox label="Consume Items" checked={obj.consume_items} onChange={(v) => onUpdate('consume_items', v)} />
        <Checkbox label="Match NBT" checked={obj.match_nbt} onChange={(v) => onUpdate('match_nbt', v)} />
        <Checkbox label="Ignore NBT" checked={obj.ignore_nbt} onChange={(v) => onUpdate('ignore_nbt', v)} />
        <Checkbox label="Task Screen Only" checked={obj.task_screen_only} onChange={(v) => onUpdate('task_screen_only', v)} />
        <Checkbox label="Only From Crafting" checked={obj.only_from_crafting} onChange={(v) => onUpdate('only_from_crafting', v)} />
        <Checkbox label="Match Components" checked={obj.match_components} onChange={(v) => onUpdate('match_components', v)} />
      </div>
    </>
  )
}

function FluidEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Row>
      <Field label="Fluid ID"><input type="text" value={obj.fluid_id} onChange={(e) => onUpdate('fluid_id', e.target.value)} /></Field>
      <Field label="Amount"><input type="number" value={obj.fluid_amount} onChange={(e) => onUpdate('fluid_amount', parseFloat(e.target.value) || 0)} /></Field>
    </Row>
  )
}

function EnergyEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Row>
      <Field label="Amount"><input type="number" value={obj.energy_amount} onChange={(e) => onUpdate('energy_amount', parseFloat(e.target.value) || 0)} /></Field>
      <Field label="Unit"><input type="text" value={obj.energy_unit} onChange={(e) => onUpdate('energy_unit', e.target.value)} /></Field>
    </Row>
  )
}

function XpEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Row>
      <Field label="XP Points"><input type="number" value={obj.xp_points} onChange={(e) => onUpdate('xp_points', parseInt(e.target.value) || 0)} /></Field>
      <Field label="Levels"><input type="number" value={obj.xp_levels} onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)} /></Field>
    </Row>
  )
}

function CommandEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Field label="Command"><input type="text" value={obj.command} onChange={(e) => onUpdate('command', e.target.value)} /></Field>
  )
}

function StatEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Row>
      <Field label="Stat"><input type="text" value={obj.stat_name} onChange={(e) => onUpdate('stat_name', e.target.value)} /></Field>
      <Field label="Count"><input type="number" value={obj.stat_value} onChange={(e) => onUpdate('stat_value', parseInt(e.target.value) || 0)} /></Field>
    </Row>
  )
}

function LocationEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <>
      <Row>
        <Field label="X"><input type="number" value={obj.x} onChange={(e) => onUpdate('x', parseFloat(e.target.value) || 0)} /></Field>
        <Field label="Y"><input type="number" value={obj.y} onChange={(e) => onUpdate('y', parseFloat(e.target.value) || 0)} /></Field>
        <Field label="Z"><input type="number" value={obj.z} onChange={(e) => onUpdate('z', parseFloat(e.target.value) || 0)} /></Field>
        <Field label="Dimension"><input type="text" value={obj.dimension} onChange={(e) => onUpdate('dimension', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Box Width"><input type="number" min="1" value={obj.box_w || 1} onChange={(e) => onUpdate('box_w', Math.max(1, parseFloat(e.target.value) || 1))} /></Field>
        <Field label="Box Height"><input type="number" min="1" value={obj.box_h || 1} onChange={(e) => onUpdate('box_h', Math.max(1, parseFloat(e.target.value) || 1))} /></Field>
        <Field label="Box Depth"><input type="number" min="1" value={obj.box_d || 1} onChange={(e) => onUpdate('box_d', Math.max(1, parseFloat(e.target.value) || 1))} /></Field>
      </Row>
      <div className="quest-detail-checkboxes">
        <Checkbox label="Ignore Dimension" checked={obj.ignore_dim} onChange={(v) => onUpdate('ignore_dim', v)} />
      </div>
    </>
  )
}

function EntityKillEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <>
      <Row>
        <Field label="Entity"><input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} placeholder="e.g. minecraft:zombie" /></Field>
        <Field label="Entity Type Tag"><input type="text" value={obj.entity_type_tag} onChange={(e) => onUpdate('entity_type_tag', e.target.value)} placeholder="e.g. minecraft:hostile" /></Field>
      </Row>
      <Field label="Custom Name"><input type="text" value={obj.custom_name} onChange={(e) => onUpdate('custom_name', e.target.value)} placeholder="Optional custom name/predicate" /></Field>
      <Field label="NBT Filter"><input type="text" value={obj.nbt_filter} onChange={(e) => onUpdate('nbt_filter', e.target.value)} placeholder="e.g. {Damage: 3}" /></Field>
    </>
  )
}

function AdvancementEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Row>
      <Field label="Advancement ID"><input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} /></Field>
      <Field label="Criterion"><input type="text" value={obj.criterion} onChange={(e) => onUpdate('criterion', e.target.value)} placeholder="Optional" /></Field>
    </Row>
  )
}

function GameStageEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <>
      <Field label="Stage"><input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} placeholder="e.g. stage_name" /></Field>
      <div className="quest-detail-checkboxes">
        <Checkbox label="Team Stage" checked={obj.team_stage} onChange={(v) => onUpdate('team_stage', v)} />
      </div>
    </>
  )
}

function ObservationEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Field label="Range"><input type="number" value={obj.observation_range} onChange={(e) => onUpdate('observation_range', parseFloat(e.target.value) || 0)} /></Field>
  )
}

function VisitBiomeEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Field label="Biome"><input type="text" value={obj.biome_id} onChange={(e) => onUpdate('biome_id', e.target.value)} /></Field>
  )
}

function FindStructureEditor({ obj, onUpdate }: ObjectiveEditorProps) {
  return (
    <Field label="Structure"><input type="text" value={obj.structure_id} onChange={(e) => onUpdate('structure_id', e.target.value)} /></Field>
  )
}

/** Types with no extra fields (checkmark, custom). */
function EmptyEditor() {
  return null
}

const ITEM_FAMILY = ['item_acquisition', 'item_retrieval', 'item_crafting', 'block_break', 'block_place']

/**
 * Per-type objective editors — one small component per objective type (or
 * shared family), dispatched by objective_type. Adding a new type = one new
 * component + one registry entry; the card itself never grows.
 */
export const OBJECTIVE_EDITOR: Record<string, ComponentType<ObjectiveEditorProps>> = {
  fluid: FluidEditor,
  energy: EnergyEditor,
  xp: XpEditor,
  command: CommandEditor,
  stat: StatEditor,
  location_visit: LocationEditor,
  entity_kill: EntityKillEditor,
  advancement: AdvancementEditor,
  game_stage: GameStageEditor,
  observation: ObservationEditor,
  visit_biome: VisitBiomeEditor,
  find_structure: FindStructureEditor,
  checkmark: EmptyEditor,
  custom: EmptyEditor,
}

for (const t of ITEM_FAMILY) {
  OBJECTIVE_EDITOR[t] = ItemFamilyEditor
}

/** The editor for a type, or null when the type has no extra fields. */
export function objectiveEditorFor(type: string): ComponentType<ObjectiveEditorProps> | null {
  return OBJECTIVE_EDITOR[type] ?? null
}
