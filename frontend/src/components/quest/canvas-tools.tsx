// Canvas tool controls: quest search, align/distribute, read-only lock, and
// book theme preset picker. Pure presentational components — all state lives in
// QuestCanvas / QuestBookEditor.
import type { AlignMode, DistributeMode } from '../../core/quest/align';
import { BOOK_THEME_PRESETS } from '../../core/quest/theme-presets';

export const ALIGN_MODES: Array<{ mode: AlignMode; label: string; title: string }> = [
  { mode: 'left', label: '⇤', title: 'Align centers to leftmost' },
  { mode: 'centerX', label: '⇔', title: 'Align centers horizontally' },
  { mode: 'right', label: '⇥', title: 'Align centers to rightmost' },
  { mode: 'top', label: '⇧', title: 'Align centers to topmost' },
  { mode: 'centerY', label: '⇅', title: 'Align centers vertically' },
  { mode: 'bottom', label: '⇩', title: 'Align centers to bottommost' },
];

export const DISTRIBUTE_MODES: Array<{ mode: DistributeMode; label: string; title: string }> = [
  { mode: 'horizontal', label: '↔', title: 'Distribute evenly horizontally' },
  { mode: 'vertical', label: '↕', title: 'Distribute evenly vertically' },
];

export function QuestSearchBar({
  query,
  matchCount,
  onQueryChange,
  onFocusFirst,
}: {
  query: string;
  matchCount: number;
  onQueryChange: (q: string) => void;
  onFocusFirst: () => void;
}) {
  return (
    <div className="canvas-search">
      <input
        className="canvas-search-input"
        type="text"
        value={query}
        placeholder="Search quests…"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matchCount > 0) onFocusFirst();
          if (e.key === 'Escape') onQueryChange('');
        }}
        aria-label="Search quests"
      />
      {query.trim() && (
        <span className="canvas-search-count" title={matchCount === 0 ? 'No quests match' : 'Quest matches'}>
          {matchCount > 0 ? matchCount : '0'}
        </span>
      )}
      {query.trim() && (
        <button
          className="canvas-search-clear"
          title="Clear search (Esc)"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function AlignDistributeControls({
  selectedCount,
  onAlign,
  onDistribute,
}: {
  selectedCount: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
}) {
  const alignDisabled = selectedCount < 2;
  const distributeDisabled = selectedCount < 3;
  return (
    <div className="align-distribute-controls" title="Align / distribute selected quests">
      {ALIGN_MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          className="toolbar-btn align-btn"
          disabled={alignDisabled}
          title={`${title} (${alignDisabled ? 'needs 2+ selected' : 'selected'})`}
          onClick={() => onAlign(mode)}
        >
          {label}
        </button>
      ))}
      <span className="align-divider" />
      {DISTRIBUTE_MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          className="toolbar-btn align-btn"
          disabled={distributeDisabled}
          title={`${title} (${distributeDisabled ? 'needs 3+ selected' : 'selected'})`}
          onClick={() => onDistribute(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function EditLockButton({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  return (
    <button
      className={`toolbar-btn${locked ? ' toolbar-btn-active' : ''}`}
      onClick={onToggle}
      title={locked ? 'Read-only mode: quests can be inspected but not moved or edited (click to unlock)' : 'Lock the canvas to read-only (click to lock)'}
    >
      {locked ? '🔒 View' : '✏️ Edit'}
    </button>
  );
}

export function ThemePresetPicker({
  value,
  onApply,
}: {
  value: string | undefined;
  onApply: (id: string) => void;
}) {
  return (
    <label className="canvas-theme-picker" title="Apply a self-authored book-level visual preset">
      <span className="canvas-theme-label">Theme</span>
      <select
        value={value || ''}
        onChange={(e) => onApply(e.target.value)}
        aria-label="Book theme preset"
      >
        <option value="">Editor default</option>
        {BOOK_THEME_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.description}
          </option>
        ))}
      </select>
    </label>
  );
}
