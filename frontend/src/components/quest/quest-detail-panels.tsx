import { useEffect, useRef, useState } from 'react'
import type { QuestNodeData, RewardTableData } from '../../services/api'
import { ObjectiveCard } from './objective-card'
import { RewardCard } from './reward-card'
import { QuestSlotIcon } from './quest-slot-icon'
import { MILESTONE_COLOR } from './quest-form-constants'
import { MILESTONE_SHAPE } from '../../core/quest/quest-shapes'
import {
  AppearanceSection,
  VisibilitySection,
  DependenciesSection,
  MiscSection,
} from './quest-section-groups'

interface QuestDetailPanelsProps {
  node: QuestNodeData
  textureIndex: Record<string, string>
  rewardTables?: RewardTableData[]
  iconUrl: string
  iconPending: boolean
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  onPickIcon: () => void
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
  onAddObjective: (nodeId: string) => void
  onRemoveObjective: (nodeId: string, objectiveId: string) => void
  onUpdateObjective: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onMoveObjective: (nodeId: string, objectiveId: string, dir: -1 | 1) => void
  onAddReward: (nodeId: string) => void
  onRemoveReward: (nodeId: string, rewardId: string) => void
  onUpdateReward: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  onMoveReward: (nodeId: string, rewardId: string, dir: -1 | 1) => void
}

/**
 * The quest detail drawer's single scrollable surface: Description, Tasks
 * and Rewards stack on top (the content, always visible together), then the
 * Settings groups (Appearance, Visibility, Dependencies, Misc) stack
 * underneath — one column, no tabs. Tasks and rewards render as in-game
 * style icon strips: one tile per entry, click to select, the selected
 * entry's full card below. Selection is clamped to the list length so
 * removing the selected entry can't leave an out-of-range index.
 */
export function QuestDetailPanels({
  node,
  textureIndex,
  rewardTables,
  iconUrl,
  iconPending,
  onUpdateNode,
  onPickIcon,
  onOpenItemPicker,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
  onMoveObjective,
  onAddReward,
  onRemoveReward,
  onUpdateReward,
  onMoveReward,
}: QuestDetailPanelsProps) {
  const [selectedTask, setSelectedTask] = useState(0)
  const [selectedReward, setSelectedReward] = useState(0)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Auto-size the description box to its content: reset then measure, so the
  // height always tracks what's typed (min-height: 90px holds the 5-line
  // floor). Runs on every edit; the drawer scrolls when the quest is long.
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [node.description])

  const setNode = (field: string, value: unknown) => {
    onUpdateNode(node.id, { [field]: value } as Partial<QuestNodeData>)
  }

  // Milestone preset = diamond shape + gold accent when the quest has no
  // colour of its own. Both are real FTB SNBT fields (shape + color); a
  // single onUpdateNode call keeps it one undo step. Unmarking resets the
  // shape to 'default' (inherit chapter default) and leaves the colour alone.
  const handleSetMilestone = (on: boolean) => {
    onUpdateNode(node.id, on
      ? { shape: MILESTONE_SHAPE, color: node.color || MILESTONE_COLOR }
      : { shape: 'default' })
  }

  // Strip selection, clamped: deleting the selected entry (or the list
  // shrinking any other way) can't leave the index past the last item.
  const taskIdx = Math.min(selectedTask, Math.max(0, node.objectives.length - 1))
  const rewardIdx = Math.min(selectedReward, Math.max(0, node.rewards.length - 1))

  // Description is the flexible section — it absorbs leftover drawer height;
  // tasks and rewards stay compact so all content is on screen at once.
  return (
    <>
      <div className="quest-detail-panel quest-detail-panel-description">
        <div className="quest-detail-panel-title">Description</div>
        <textarea
          ref={descriptionRef}
          className="quest-detail-textarea quest-detail-textarea-stack"
          value={node.description}
          onChange={(e) => onUpdateNode(node.id, { description: e.target.value })}
          placeholder="Quest description..."
        />
      </div>
      <div className="quest-detail-panel quest-detail-stack-section">
        <div className="quest-detail-panel-title">Tasks ({node.objectives.length})</div>
        {/* In-game style icon strip: one tile per task, click to select;
            the selected task's full card renders below. */}
        <div className="quest-detail-icon-strip">
          {node.objectives.map((obj, idx) => (
            <QuestSlotIcon
              key={obj.id}
              target={obj.target || obj.fluid_id}
              smartFilter={obj.smart_filter}
              objectiveType={obj.objective_type}
              textureIndex={textureIndex}
              size={32}
              className={`quest-detail-task-icon${idx === taskIdx ? ' selected' : ''}`}
              onClick={() => setSelectedTask(idx)}
              title={obj.target || `Task ${idx + 1}`}
            />
          ))}
          <button
            className="quest-detail-add-tile"
            onClick={() => {
              onAddObjective(node.id)
              setSelectedTask(node.objectives.length)
            }}
            title="Add Task"
          >+</button>
        </div>
        {node.objectives.length === 0 ? (
          <div className="quest-detail-empty">No tasks defined</div>
        ) : (
          <ObjectiveCard
            key={node.objectives[taskIdx].id}
            obj={node.objectives[taskIdx]}
            index={taskIdx}
            textureIndex={textureIndex}
            onRemove={() => onRemoveObjective(node.id, node.objectives[taskIdx].id)}
            onUpdate={(field, value) => onUpdateObjective(node.id, node.objectives[taskIdx].id, field, value)}
            onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'objective', id: node.objectives[taskIdx].id, nodeId: node.id }) : undefined}
            onMoveUp={taskIdx > 0 ? () => { onMoveObjective(node.id, node.objectives[taskIdx].id, -1); setSelectedTask(taskIdx - 1) } : undefined}
            onMoveDown={taskIdx < node.objectives.length - 1 ? () => { onMoveObjective(node.id, node.objectives[taskIdx].id, 1); setSelectedTask(taskIdx + 1) } : undefined}
          />
        )}
      </div>
      <div className="quest-detail-panel quest-detail-stack-section">
        <div className="quest-detail-panel-title">Rewards ({node.rewards.length})</div>
        <div className="quest-detail-icon-strip">
          {node.rewards.map((rew, idx) => (
            <QuestSlotIcon
              key={rew.id}
              target={rew.item_id || rew.items[0] || ''}
              smartFilter={rew.smart_filter}
              objectiveType={rew.reward_type}
              textureIndex={textureIndex}
              size={32}
              className={`quest-detail-task-icon${idx === rewardIdx ? ' selected' : ''}`}
              onClick={() => setSelectedReward(idx)}
              title={rew.item_id || `Reward ${idx + 1}`}
            />
          ))}
          <button
            className="quest-detail-add-tile"
            onClick={() => {
              onAddReward(node.id)
              setSelectedReward(node.rewards.length)
            }}
            title="Add Reward"
          >+</button>
        </div>
        {node.rewards.length === 0 ? (
          <div className="quest-detail-empty">No rewards</div>
        ) : (
          <RewardCard
            key={node.rewards[rewardIdx].id}
            rew={node.rewards[rewardIdx]}
            index={rewardIdx}
            textureIndex={textureIndex}
            onRemove={() => onRemoveReward(node.id, node.rewards[rewardIdx].id)}
            onUpdate={(field, value) => onUpdateReward(node.id, node.rewards[rewardIdx].id, field, value)}
            onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'reward', id: node.rewards[rewardIdx].id, nodeId: node.id }) : undefined}
            rewardTables={rewardTables}
            onMoveUp={rewardIdx > 0 ? () => { onMoveReward(node.id, node.rewards[rewardIdx].id, -1); setSelectedReward(rewardIdx - 1) } : undefined}
            onMoveDown={rewardIdx < node.rewards.length - 1 ? () => { onMoveReward(node.id, node.rewards[rewardIdx].id, 1); setSelectedReward(rewardIdx + 1) } : undefined}
          />
        )}
      </div>

      <div className="quest-detail-settings-divider">Settings</div>

      <AppearanceSection
        node={node}
        onUpdateNode={setNode}
        iconUrl={iconUrl}
        iconPending={iconPending}
        onPickIcon={onPickIcon}
        onSetMilestone={handleSetMilestone}
      />
      <VisibilitySection node={node} onUpdateNode={setNode} />
      <DependenciesSection node={node} onUpdateNode={setNode} />
      <MiscSection node={node} onUpdateNode={setNode} />
    </>
  )
}
