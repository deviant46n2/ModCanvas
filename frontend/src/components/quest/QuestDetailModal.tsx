import { useCallback, useState } from 'react'
import type { QuestNodeData, RewardTableData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { CheckSquareIcon, FileTextIcon, TrophyIcon, XIcon } from '../ui/icons'
import { SmartFilterIcon } from './SmartFilterIcon'
import { ObjectiveCard } from './objective-card'
import { RewardCard } from './reward-card'
import {
  SectionNav,
  type QuestSectionId,
} from './quest-detail-sections'
import {
  AppearanceSection,
  VisibilitySection,
  DependenciesSection,
  MiscSection,
} from './quest-section-groups'
import type { ProgressState } from '../../core/quest/progress'

interface QuestDetailModalProps {
  node: QuestNodeData
  textureIndex: Record<string, string>
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  onDeleteNode: (nodeId: string) => void
  onAddObjective: (nodeId: string) => void
  onRemoveObjective: (nodeId: string, objectiveId: string) => void
  onUpdateObjective: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onMoveObjective: (nodeId: string, objectiveId: string, dir: -1 | 1) => void
  onAddReward: (nodeId: string) => void
  onRemoveReward: (nodeId: string, rewardId: string) => void
  onUpdateReward: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  onMoveReward: (nodeId: string, rewardId: string, dir: -1 | 1) => void
  openIconPicker: (target: { type: 'quest'; nodeId: string }) => void
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
  onClose: () => void
  simProgress?: ProgressState
  onSetQuestProgress?: (questId: string, status: 'started' | 'complete' | null) => void
  quests?: Array<{ id: string; label: string }>
  rewardTables?: RewardTableData[]
}

export function QuestDetailModal({
  node,
  textureIndex,
  onUpdateNode,
  onDeleteNode,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
  onMoveObjective,
  onAddReward,
  onRemoveReward,
  onUpdateReward,
  onMoveReward,
  openIconPicker,
  onOpenItemPicker,
  onClose,
  simProgress,
  onSetQuestProgress,
  quests,
  rewardTables,
}: QuestDetailModalProps) {
  const [openSections, setOpenSections] = useState<Partial<Record<QuestSectionId, boolean>>>({})

  const setNode = useCallback(
    (field: string, value: unknown) => {
      onUpdateNode(node.id, { [field]: value } as Partial<QuestNodeData>)
    },
    [node.id, onUpdateNode]
  )

  const jumpToSection = useCallback((id: QuestSectionId) => {
    setOpenSections(prev => ({ ...prev, [id]: true }))
    requestAnimationFrame(() => {
      document.getElementById(`quest-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const toggleSection = useCallback((id: QuestSectionId) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const iconKey = resolveIconKey(node.icon)
  const iconUrl = questIconUrl(node.icon, textureIndex)
  const iconPending = isTexturePending(textureIndex, iconKey)

  return (
    <div className="quest-detail-overlay" onClick={onClose}>
      <div className="quest-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quest-detail-header">
          <button
            className="quest-detail-icon-btn"
            onClick={() => openIconPicker({ type: 'quest', nodeId: node.id })}
            title="Change quest icon"
            style={{ backgroundColor: node.color || 'var(--color-accent)' }}
          >
            {!node.icon && node.objectives?.[0]?.smart_filter ? (
              <SmartFilterIcon
                dsl={node.objectives[0].smart_filter}
                textureIndex={textureIndex}
                fallback="?"
                size={28}
              />
            ) : iconUrl ? (
              <AnimatedSprite url={iconUrl} textureKey={iconKey} width={28} height={28} alt="" />
            ) : iconPending ? (
              <QuestIcon pending url={null} fallback="" size={28} />
            ) : (
              <span className="quest-detail-icon-fallback">?</span>
            )}
            <span className="quest-detail-icon-badge">Change</span>
          </button>
          <div className="quest-detail-title-area">
            <input
              className="quest-detail-title-input"
              value={node.label}
              onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
              placeholder="Quest Title"
            />
            <input
              className="quest-detail-subtitle-input"
              value={node.subtitle || ''}
              onChange={(e) => onUpdateNode(node.id, { subtitle: e.target.value })}
              placeholder="Subtitle (optional)"
            />
          </div>
          <button className="quest-detail-close" onClick={onClose} aria-label="Close quest details"><XIcon size={14} /></button>
        </div>

        <div className="quest-detail-body">
          {node.node_type === 'quest_link' && (
            <section className="quest-detail-section quest-link-section">
              <div className="quest-detail-section-header">
                <span>Quest Link</span>
              </div>
              <div className="quest-detail-field">
                <label>Linked Quest</label>
                <select
                  value={node.link_target || ''}
                  onChange={(e) => onUpdateNode(node.id, { link_target: e.target.value })}
                >
                  <option value="">— Unlinked —</option>
                  {(quests || [])
                    .filter(q => q.id !== node.id)
                    .map(q => (
                      <option key={q.id} value={q.id}>{q.label}</option>
                    ))}
                </select>
              </div>
              <div className="quest-detail-empty">A link references a quest in another chapter; the icon and visibility follow the target quest in-game.</div>
            </section>
          )}

          <SectionNav openSections={openSections} onJump={jumpToSection} />

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon"><FileTextIcon size={14} /></span>
              <span className="quest-detail-section-title">Description</span>
            </div>
            <textarea
              className="quest-detail-textarea"
              value={node.description}
              onChange={(e) => onUpdateNode(node.id, { description: e.target.value })}
              placeholder="Quest description..."
              rows={3}
            />
          </section>

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon"><CheckSquareIcon size={14} /></span>
              <span className="quest-detail-section-title">Tasks ({node.objectives.length})</span>
              <button className="quest-detail-add-btn" onClick={() => onAddObjective(node.id)} title="Add Task">+</button>
            </div>
            {node.objectives.length === 0 && <div className="quest-detail-empty">No tasks defined</div>}
            {node.objectives.map((obj, idx) => (
              <ObjectiveCard
                key={obj.id}
                obj={obj}
                index={idx}
                textureIndex={textureIndex}
                onRemove={() => onRemoveObjective(node.id, obj.id)}
                onUpdate={(field, value) => onUpdateObjective(node.id, obj.id, field, value)}
                onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'objective', id: obj.id, nodeId: node.id }) : undefined}
                onMoveUp={idx > 0 ? () => onMoveObjective(node.id, obj.id, -1) : undefined}
                onMoveDown={idx < node.objectives.length - 1 ? () => onMoveObjective(node.id, obj.id, 1) : undefined}
              />
            ))}
          </section>

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon"><TrophyIcon size={14} /></span>
              <span className="quest-detail-section-title">Rewards ({node.rewards.length})</span>
              <button className="quest-detail-add-btn" onClick={() => onAddReward(node.id)} title="Add Reward">+</button>
            </div>
            {node.rewards.length === 0 && <div className="quest-detail-empty">No rewards</div>}
            {node.rewards.map((rew, idx) => (
              <RewardCard
                key={rew.id}
                rew={rew}
                index={idx}
                textureIndex={textureIndex}
                onRemove={() => onRemoveReward(node.id, rew.id)}
                onUpdate={(field, value) => onUpdateReward(node.id, rew.id, field, value)}
                onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'reward', id: rew.id, nodeId: node.id }) : undefined}
                rewardTables={rewardTables}
                onMoveUp={idx > 0 ? () => onMoveReward(node.id, rew.id, -1) : undefined}
                onMoveDown={idx < node.rewards.length - 1 ? () => onMoveReward(node.id, rew.id, 1) : undefined}
              />
            ))}
          </section>

          <AppearanceSection
            node={node}
            onUpdateNode={setNode}
            open={!!openSections.appearance}
            onToggle={() => toggleSection('appearance')}
            iconUrl={iconUrl}
            iconPending={iconPending}
            onPickIcon={() => openIconPicker({ type: 'quest', nodeId: node.id })}
          />
          <VisibilitySection
            node={node}
            onUpdateNode={setNode}
            open={!!openSections.visibility}
            onToggle={() => toggleSection('visibility')}
          />
          <DependenciesSection
            node={node}
            onUpdateNode={setNode}
            open={!!openSections.dependencies}
            onToggle={() => toggleSection('dependencies')}
          />
          <MiscSection
            node={node}
            onUpdateNode={setNode}
            open={!!openSections.misc}
            onToggle={() => toggleSection('misc')}
          />
        </div>

        <div className="quest-detail-footer">
          <div className="quest-detail-footer-left">
            <button
              className="quest-detail-sim-btn"
              onClick={() => onSetQuestProgress?.(node.id, simProgress?.[node.id] === 'complete' ? null : 'complete')}
              title="Toggle this quest's completion in the progress simulation (Simulate mode)"
            >
              {simProgress?.[node.id] === 'complete' ? 'Reset' : 'Complete'}
            </button>
          </div>
          <div className="quest-detail-footer-right">
            <button className="quest-detail-delete-btn" onClick={() => { onDeleteNode(node.id); onClose() }}>Delete Quest</button>
            <button className="quest-detail-ghost-btn" onClick={onClose}>Cancel</button>
            <button className="quest-detail-save-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
