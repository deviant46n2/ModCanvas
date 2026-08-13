import type { QuestNodeData, RewardTableData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { textureDisplayUrl, isTexturePending } from '../../services/texture-loader'
import { shapeTextureKeys } from '../../core/quest/quest-shapes'
import { EDGE_STATE_COLORS } from '../../core/quest/edge-state'
import { XIcon } from '../ui/icons'
import { QuestDetailPanels } from './quest-detail-panels'
import { QuestTile } from './QuestTile'
import { QuestSelect } from './QuestSelect'
import type { ProgressState } from '../../core/quest/progress'

interface QuestDetailModalProps {
  node: QuestNodeData
  textureIndex: Record<string, string>
  /** Effective quest shape (own shape else chapter default) — matches the canvas. */
  effectiveShape?: string
  /** Quest locked (prerequisites unmet) per the sim progress — matches the canvas. */
  locked?: boolean
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
  effectiveShape,
  locked,
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
  const iconKey = resolveIconKey(node.icon)
  const iconUrl = questIconUrl(node.icon, textureIndex)
  const iconPending = isTexturePending(textureIndex, iconKey)
  // Smart-filter quests carry their DSL on a task, exactly like the canvas
  // derives it — the header tile renders the filter when no icon is set.
  const smartFilter = node.objectives?.find((o) => o.smart_filter)?.smart_filter

  // Header tile renders exactly like the canvas: same effective shape, same
  // runtime shape textures, same icon scale. The state ring uses the same
  // palette as the dependency edges so the header and canvas never disagree.
  // DELIBERATE (s51): the tile is a FIXED 48px identity anchor — it does NOT
  // scale with the quest's size, and no iconBaseSize is passed (the icon keeps
  // the 0.667 plate fraction, matching the canvas relation at 1.0x: 32/48 =
  // 24/36). Passing iconBaseSize here would shrink the icon to 24px in a 48px
  // plate (0.5 relation) and break the verified match. The drawer is a detail
  // surface, not a spatial view — scaled quests read their true size on the
  // canvas, not here. Verified against the in-game canvas 2026-08-13.
  const shape = effectiveShape || node.shape || ''
  const shapeKeys = shapeTextureKeys(shape)
  const shapeTextures = {
    background: textureDisplayUrl(textureIndex, shapeKeys.background) || '',
    outline: textureDisplayUrl(textureIndex, shapeKeys.outline) || '',
    shape: textureDisplayUrl(textureIndex, shapeKeys.shape) || '',
  }
  const hasShapeTextures = !!(shapeTextures.background && shapeTextures.outline)
  const isComplete = simProgress?.[node.id] === 'complete'
  const ringColor = isComplete
    ? EDGE_STATE_COLORS.completed
    : locked
      ? EDGE_STATE_COLORS.unavailable
      : EDGE_STATE_COLORS.uncompleted

  const isLink = node.node_type === 'quest_link'

  return (
    <div className="quest-detail-overlay" onClick={onClose}>
      <div className="quest-detail-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="quest-detail-header">
          <div className="quest-detail-tile-ring" style={{ borderColor: ringColor }}>
            <QuestTile
              shape={shape}
              color={node.color}
              shapeTextures={hasShapeTextures ? shapeTextures : undefined}
              size={48}
              icon={node.icon}
              iconUrl={iconUrl}
              iconScaling={node.icon_scaling}
              smartFilter={smartFilter}
              textureIndex={textureIndex}
            />
          </div>
          <div className="quest-detail-title-area">
            <input
              className="quest-detail-title-input"
              value={node.label || ''}
              onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
              placeholder="Quest title..."
            />
            <input
              className="quest-detail-subtitle-input"
              value={node.subtitle || ''}
              onChange={(e) => onUpdateNode(node.id, { subtitle: e.target.value })}
              placeholder="Subtitle..."
            />
          </div>
          <button
            className={`quest-detail-state-chip${isComplete ? ' state-complete' : ''}${locked ? ' state-locked' : ''}`}
            onClick={() => onSetQuestProgress?.(node.id, isComplete ? null : 'complete')}
            title={locked ? 'Locked — prerequisites not complete (sim)' : isComplete ? 'Completed (sim) — click to reset' : 'Not started — click to mark complete (sim)'}
          >
            <span className="quest-detail-state-dot" style={{ background: ringColor }} />
            {isComplete ? 'Completed' : locked ? 'Locked' : 'Not started'}
          </button>
          <button className="quest-detail-close" onClick={onClose} aria-label="Close quest details"><XIcon size={14} /></button>
        </header>

        <div className="quest-detail-panel-area">
          {isLink && (
            <div className="quest-detail-panel quest-link-section">
              <div className="quest-detail-panel-title">Quest Link</div>
              <div className="quest-detail-field">
                <label>Linked Quest</label>
                <QuestSelect
                  value={node.link_target || ''}
                  onChange={(v) => onUpdateNode(node.id, { link_target: v })}
                  ariaLabel="Linked quest"
                  options={[
                    { value: '', label: '— Unlinked —' },
                    ...(quests || [])
                      .filter(q => q.id !== node.id)
                      .map(q => ({ value: q.id, label: q.label })),
                  ]}
                />
              </div>
              <div className="quest-detail-empty">
                A link references a quest in another chapter; the icon and visibility follow the target quest in-game.
              </div>
            </div>
          )}
          <QuestDetailPanels
            node={node}
            textureIndex={textureIndex}
            rewardTables={rewardTables}
            iconUrl={iconUrl || ''}
            iconPending={iconPending}
            onUpdateNode={onUpdateNode}
            onPickIcon={() => openIconPicker({ type: 'quest', nodeId: node.id })}
            onOpenItemPicker={onOpenItemPicker}
            onAddObjective={onAddObjective}
            onRemoveObjective={onRemoveObjective}
            onUpdateObjective={onUpdateObjective}
            onMoveObjective={onMoveObjective}
            onAddReward={onAddReward}
            onRemoveReward={onRemoveReward}
            onUpdateReward={onUpdateReward}
            onMoveReward={onMoveReward}
          />
        </div>

        <footer className="quest-detail-footer">
          <div className="quest-detail-footer-left">
            <button
              className="quest-detail-sim-btn"
              onClick={() => onSetQuestProgress?.(node.id, isComplete ? null : 'complete')}
              title="Toggle this quest's completion in the progress simulation (Simulate mode)"
            >
              {isComplete ? 'Reset' : 'Complete'}
            </button>
          </div>
          <div className="quest-detail-footer-right">
            <button className="quest-detail-delete-btn" onClick={() => { onDeleteNode(node.id); onClose() }}>Delete Quest</button>
            <button className="quest-detail-ghost-btn" onClick={onClose}>Cancel</button>
            <button className="quest-detail-save-btn" onClick={onClose}>Done</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
