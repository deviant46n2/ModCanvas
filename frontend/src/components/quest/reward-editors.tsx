import type { ComponentType } from 'react'
import type { QuestRewardData, RewardTableData } from '../../services/api'
import { PackageIcon } from '../ui/icons'
import { QuestSelect } from './QuestSelect'

/** Props every reward-type editor receives from RewardCard. */
export interface RewardEditorProps {
  rew: QuestRewardData
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
  rewardTables?: RewardTableData[]
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

/** Item rewards: id + count + weight (the editor's primary fields). */
function ItemEditor({ rew, onUpdate, onOpenItemPicker }: RewardEditorProps) {
  return (
    <>
      <Row>
        <Field label="Item ID">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="text" value={rew.item_id || rew.items[0] || ''} onChange={(e) => onUpdate('item_id', e.target.value)} placeholder="e.g. minecraft:diamond" style={{ flex: 1 }} />
            <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}><PackageIcon size={12} /></button>
          </div>
        </Field>
        <Field label="Count"><input type="number" value={rew.item_count} onChange={(e) => onUpdate('item_count', parseInt(e.target.value) || 1)} /></Field>
        <Field label="Weight"><input type="number" step="0.1" value={rew.weight} onChange={(e) => onUpdate('weight', parseFloat(e.target.value) || 1.0)} /></Field>
      </Row>
      <div className="quest-detail-checkboxes">
        <Checkbox label="Random Bonus" checked={rew.random_bonus > 0} onChange={(v) => onUpdate('random_bonus', v ? (rew.random_bonus || 1) : 0)} />
        <Checkbox label="Only One" checked={rew.only_one} onChange={(v) => onUpdate('only_one', v)} />
      </div>
    </>
  )
}

/** Weighted item reward: item + weight, no count. */
function WeightedItemEditor({ rew, onUpdate, onOpenItemPicker }: RewardEditorProps) {
  return (
    <Row>
      <Field label="Item ID">
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="text" value={rew.item_id || rew.items[0] || ''} onChange={(e) => onUpdate('item_id', e.target.value)} placeholder="e.g. minecraft:diamond" style={{ flex: 1 }} />
          <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}><PackageIcon size={12} /></button>
        </div>
      </Field>
      <Field label="Weight"><input type="number" step="0.1" value={rew.weight} onChange={(e) => onUpdate('weight', parseFloat(e.target.value) || 1.0)} /></Field>
    </Row>
  )
}

/** Choice/random/all-table rewards: pick a reward table. */
function TableEditor({ rew, onUpdate, rewardTables }: RewardEditorProps) {
  return (
    <Field label="Reward Table">
      {rewardTables && rewardTables.length > 0 ? (
        <QuestSelect
          value={rew.table_id || ''}
          onChange={(v) => onUpdate('table_id', v || '')}
          ariaLabel="Reward table"
          options={[
            { value: '', label: '— No table —' },
            ...rewardTables.map((t) => ({ value: t.id, label: t.title })),
          ]}
        />
      ) : (
        <input type="text" value={rew.table_id || ''} onChange={(e) => onUpdate('table_id', e.target.value)} placeholder="Reward table id" />
      )}
    </Field>
  )
}

/** XP rewards: xp amount + levels. */
function XpEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <Row>
      <Field label="XP Amount"><input type="number" value={rew.xp_amount} onChange={(e) => onUpdate('xp_amount', parseInt(e.target.value) || 0)} /></Field>
      <Field label="Levels"><input type="number" value={rew.xp_levels} onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)} /></Field>
    </Row>
  )
}

function CommandEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <>
      <Field label="Command"><input type="text" value={rew.command} onChange={(e) => onUpdate('command', e.target.value)} /></Field>
      <Row>
        <Field label="Permission Level"><input type="number" min="0" max="4" value={rew.permission_level} onChange={(e) => onUpdate('permission_level', parseInt(e.target.value) || 0)} /></Field>
        <Field label="Feedback Message"><input type="text" value={rew.feedback_message} onChange={(e) => onUpdate('feedback_message', e.target.value)} placeholder="Optional" /></Field>
      </Row>
      <div className="quest-detail-checkboxes">
        <Checkbox label="Silent" checked={rew.silent} onChange={(v) => onUpdate('silent', v)} />
      </div>
    </>
  )
}

function LootTableEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <Field label="Loot Table"><input type="text" value={rew.loot_table} onChange={(e) => onUpdate('loot_table', e.target.value)} /></Field>
  )
}

function GameStageEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <Field label="Stage"><input type="text" value={rew.game_stage} onChange={(e) => onUpdate('game_stage', e.target.value)} /></Field>
  )
}

function ToastEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <Field label="Toast Message"><input type="text" value={rew.toast_message} onChange={(e) => onUpdate('toast_message', e.target.value)} /></Field>
  )
}

function AdvancementEditor({ rew, onUpdate }: RewardEditorProps) {
  return (
    <Field label="Advancement ID"><input type="text" value={rew.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} /></Field>
  )
}

/** Types with no extra fields (custom). */
function EmptyEditor() {
  return null
}

/**
 * Per-type reward editors — one small component per reward type, dispatched
 * by reward_type. Adding a new type = one new component + one registry entry;
 * the card itself never grows.
 */
export const REWARD_EDITOR: Record<string, ComponentType<RewardEditorProps>> = {
  item: ItemEditor,
  item_weighted: WeightedItemEditor,
  choice: TableEditor,
  random: TableEditor,
  all_table: TableEditor,
  experience: XpEditor,
  xp_levels: XpEditor,
  command: CommandEditor,
  loot_table: LootTableEditor,
  game_stage: GameStageEditor,
  unlock: GameStageEditor,
  toast: ToastEditor,
  advancement: AdvancementEditor,
  custom: EmptyEditor,
}

/** The editor for a type, or null when the type has no extra fields. */
export function rewardEditorFor(type: string): ComponentType<RewardEditorProps> | null {
  return REWARD_EDITOR[type] ?? null
}
