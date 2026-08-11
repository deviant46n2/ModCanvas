// Pure dependency-edge state resolution and palette.
//
// The in-game FTB Quests quest screen colors dependency lines by the
// prerequisite quest's completion state (completed / uncompleted / unavailable)
// and paints the hovered quest's fan with its own hues (requires / required
// for). ModCanvas mirrors that SEMANTIC model — state in, color out — while
// rendering with its own procedural SVG stroke (no game assets are used).
//
// Values below match the game's default theme (from the mod's
// `ftb_quests_theme.txt`), documented in docs/design.md §2.4. This module is
// the single source of truth for the edge palette: the renderer and the canvas
// model both import from here, so the palette can never drift.

export type EdgeDisplayState =
  | 'completed'
  | 'uncompleted'
  | 'unavailable'
  | 'requires'
  | 'required-for'
  | 'cycle'

/** Alpha bytes from the game's 8-digit hex (`#B4CCA3A3` = pink @ 70.6%). */
const UNCOMPLETED_ALPHA = 0xb4 / 255
const UNAVAILABLE_ALPHA = 0x64 / 255

export const EDGE_STATE_COLORS: Record<EdgeDisplayState, string> = {
  completed: '#64DC64',
  uncompleted: `rgba(204, 163, 163, ${UNCOMPLETED_ALPHA.toFixed(3)})`,
  unavailable: `rgba(204, 163, 163, ${UNAVAILABLE_ALPHA.toFixed(3)})`,
  requires: '#00C8C8',
  'required-for': '#C8C800',
  cycle: '#F87171',
}

// Dark casing under the bright core keeps every state legible over arbitrary
// chapter artwork (light skies, dark caves, busy mod art). It is a legibility
// outline, not a state carrier — uniform for all states.
export const EDGE_CASING = 'rgba(10, 12, 18, 0.92)'

// Marching-dash pattern. Direction of dependency flow is conveyed by the dash
// animation, so the line itself never needs an arrowhead. Dash+gap = 14px, so a
// two-cycle offset (-28) loops seamlessly.
export const EDGE_DASH_ARRAY = '8 6'
export const MARCH_SLOW_CLASS = 'quest-edge-march'
export const MARCH_FAST_CLASS = 'quest-edge-march-fast'

export interface EdgeStateContext {
  /** Per-quest simulated progress; a missing entry means "not started". */
  progress: Record<string, 'started' | 'complete' | undefined>
  /** Quest id → true when the quest is locked (its own prerequisites unmet). */
  lockedById: Record<string, boolean>
  /** Quest under the pointer. Its fan takes the requires/required-for hues. */
  hoveredNodeId: string | null
  /** Edge participates in a dependency loop: error red, always wins. */
  isCycle: boolean
}

export interface EdgeStyleSpec {
  stroke: string
  opacity: number
  /** CSS `stroke-dasharray`, or null for a solid line (cycles). */
  dashArray: string | null
  /** CSS class driving the marching animation; null = static. */
  march: 'slow' | 'fast' | null
}

export function resolveEdgeState(edge: { source: string; target: string }, ctx: EdgeStateContext): EdgeDisplayState {
  if (ctx.isCycle) return 'cycle'
  if (ctx.hoveredNodeId) {
    if (edge.target === ctx.hoveredNodeId) return 'requires'
    if (edge.source === ctx.hoveredNodeId) return 'required-for'
  }
  if (ctx.progress[edge.source] === 'complete') return 'completed'
  if (ctx.lockedById[edge.source]) return 'unavailable'
  return 'uncompleted'
}

export function edgeStyleForState(state: EdgeDisplayState): EdgeStyleSpec {
  switch (state) {
    case 'cycle':
      return { stroke: EDGE_STATE_COLORS.cycle, opacity: 1, dashArray: null, march: null }
    case 'requires':
    case 'required-for':
      return { stroke: EDGE_STATE_COLORS[state], opacity: 1, dashArray: EDGE_DASH_ARRAY, march: 'fast' }
    default:
      return { stroke: EDGE_STATE_COLORS[state], opacity: 1, dashArray: EDGE_DASH_ARRAY, march: 'slow' }
  }
}
