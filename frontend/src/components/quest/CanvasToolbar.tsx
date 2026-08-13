import type { AlignMode, DistributeMode } from '../../core/quest/align'
import { WarnIcon } from '../ui/icons'
import {
  QuestSearchBar,
  AlignDistributeControls,
  EditLockButton,
  ThemePresetPicker,
} from './canvas-tools'

interface CanvasToolbarProps {
  activeChapterName: string
  activeChapter: string | null
  questCount: number
  edgeCount: number
  cycleCount: number
  showMiniMap: boolean
  setShowMiniMap: (v: boolean) => void
  showBackground: boolean
  setShowBackground: (v: boolean) => void
  editLocked: boolean
  onToggleEditLocked: () => void
  onShowShortcuts: () => void
  searchQuery: string
  searchMatchCount: number
  onQueryChange: (q: string) => void
  onFocusFirst: () => void
  milestoneOnly: boolean
  milestoneCount: number
  onToggleMilestones: () => void
  themePreset?: string
  onApplyThemePreset?: (id: string) => void
  selectedCount: number
  onAlign: (mode: AlignMode) => void
  onDistribute: (mode: DistributeMode) => void
  decorEditMode: boolean
  onToggleDecorEdit: () => void
  simMode: boolean
  onToggleSim: () => void
  onCompleteAll?: () => void
  onResetAll?: () => void
}

export function CanvasToolbar({
  activeChapterName,
  activeChapter,
  questCount,
  edgeCount,
  cycleCount,
  showMiniMap,
  setShowMiniMap,
  showBackground,
  setShowBackground,
  editLocked,
  onToggleEditLocked,
  onShowShortcuts,
  searchQuery,
  searchMatchCount,
  onQueryChange,
  onFocusFirst,
  milestoneOnly,
  milestoneCount,
  onToggleMilestones,
  themePreset,
  onApplyThemePreset,
  selectedCount,
  onAlign,
  onDistribute,
  decorEditMode,
  onToggleDecorEdit,
  simMode,
  onToggleSim,
  onCompleteAll,
  onResetAll,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar">
      <div className="toolbar-group">
        <EditLockButton locked={editLocked} onToggle={onToggleEditLocked} />
        <button className="toolbar-btn" onClick={onShowShortcuts} title="Shortcuts & gestures (?)">
          ?
        </button>
      </div>
      <div className="toolbar-group">
        <QuestSearchBar
          query={searchQuery}
          matchCount={searchMatchCount}
          onQueryChange={onQueryChange}
          onFocusFirst={onFocusFirst}
        />
        <button
          className={`toolbar-btn${milestoneOnly ? ' toolbar-btn-active' : ''}`}
          onClick={onToggleMilestones}
          title={`Milestones only: quests with a diamond shape (${milestoneCount} in this chapter) — dims the rest`}
        >
          Milestones{milestoneCount > 0 ? ` (${milestoneCount})` : ''}
        </button>
        <ThemePresetPicker value={themePreset} onApply={(id) => onApplyThemePreset?.(id)} />
      </div>
      <div className="toolbar-group">
        <AlignDistributeControls
          selectedCount={selectedCount}
          onAlign={onAlign}
          onDistribute={onDistribute}
        />
      </div>
      <div className="toolbar-group">
        <label>
          <input
            type="checkbox"
            checked={showMiniMap}
            onChange={(e) => setShowMiniMap(e.target.checked)}
          />
          Mini Map
        </label>
        <label>
          <input
            type="checkbox"
            checked={showBackground}
            onChange={(e) => setShowBackground(e.target.checked)}
          />
          Grid
        </label>
        {activeChapter && (
          <button
            className={`toolbar-btn${decorEditMode ? ' toolbar-btn-active' : ''}`}
            onClick={onToggleDecorEdit}
            title="Edit quest log decoration images for this chapter"
          >
            Decorations
          </button>
        )}
      </div>
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${simMode ? ' toolbar-btn-active' : ''}`}
          onClick={onToggleSim}
          title="Toggle progress simulation: preview hidden/locked quests, complete or reset instantly"
        >
          Simulate
        </button>
        {simMode && (
          <>
            <button className="toolbar-btn" onClick={onCompleteAll} title="Complete every quest in this chapter instantly">
              Complete All
            </button>
            <button className="toolbar-btn" onClick={onResetAll} title="Reset every quest in this chapter">
              Reset All
            </button>
          </>
        )}
      </div>
      <div className="toolbar-group">
        <span className="canvas-chapter-title" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ftb-accent)', marginRight: 12 }}>
          {activeChapterName || (activeChapter ? 'Untitled' : 'All Chapters')}
        </span>
        <span className="canvas-stats">
          {questCount} quests, {edgeCount} connections
        </span>
        {cycleCount > 0 && (
          <span className="cycle-warning" title="Dependency loops must be broken before quests unlock properly">
            <WarnIcon size={12} /> {cycleCount} circular connection{cycleCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
