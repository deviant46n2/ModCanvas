# Session Handoff — plate calibration CLOSED: the flex-shrink trap (2026-08-13, s51)

**Branch:** `master` (solo mainline). 3 files changed (quest-nodes.tsx,
canvas-nodes.css, quest-editor.md), committed `7d194ba`, **pushed, in sync**
(upstream tracking re-established — `master` had lost it). 724 frontend tests
green, tsc clean, `git diff --check` clean, integrity: standing items only
(RecipeEditor PARK, 7cc7263 doc CANDIDATE, 2 accepted assets).

## WHAT WE BUILT (one line)
Fixed the quest tile plate being flex-shrunk to ~30px inside the node's flex
column (the entire s50 calibration 0.8 → 3.45 was dialing a clipped value that
never rendered), then dialed the plate factor to **1.0 by eye against the game**
— the circle now equals the quest body (36px at 1.0x), icon pinned at 24px.

## DONE
- `7d194ba` (pushed): `flex-shrink: 0` on `.ftb-quest-shape-wrap`
  (canvas-nodes.css) — the plate was a flex item in the node's 36px flex
  COLUMN, so any plate factor > 1.0 had its height collapsed to ~30px. The
  "icon breaking out of the shape" read was a 24px icon inside a ~30px circle;
  "the relation isn't tied to whatever you're doing" was icon:plate frozen at
  0.667 because both derive from min(node) = 36.
- Plate factor dialed 3.45 → 1.0 by the student's eye vs the in-game canvas
  ("comically large" → "closest to perfect we have ever been"). CALIBRATION
  comments stripped; the history is preserved in the code comment + doc.

## IN-FLIGHT
None — the calibration is closed. The deliberate next index item is **P2 row 4
(adapter matrix)**; the standing ledger below is the detour menu.

## PENDING (owed — data, never a gate)
- **flex-shrink explain-back** (s51, carried — student ended the session; the
  mechanism is the one subtle piece, explain-back at their invitation).
- Drawer-tile nitpick: `QuestDetailModal.tsx:97` renders `QuestTile size={48}`
  hardcoded (never dialed; ignores quest scale; coincidentally shares the 0.667
  icon:plate relation with the calibrated canvas).
- Standing: devtools dead in the Tauri window; CF dummy-key test **08-15**
  reminder; `controllable` re-key (2 min, 404s every wizard load); fire-2
  tripwire (unconfirmed); section-groups 28px label lie.
- Re-reviews due **08-13**: round-trip serialization, FTB shape semantics,
  mipmap/GPU sampling.

## UNVERIFIED CLAIMS
- The calibration was eyeballed at **1.0x quests only** — scaled quests
  (0.5x/2.0x) use `max(16, min(node) × factor)` and were not compared against
  the game.
- The s50 "in-game tiles overlap deeply at 1-unit spacing" read is **corrected
  by inference** (36px plate = 6px gap at 42px pitch, student read the 1.0x
  render as matching) — not re-verified in-game at 1-unit spacing.
- The drawer's 0.667 relation is computed, not visually confirmed against the
  game.

## DECISIONS
- `PLATE-EQUALS-BODY` — plate factor 1.0: tile = quest body. The s50 "plate
  overhangs the body" assumption was rejected by the live calibration. Signal:
  the icon:plate RELATION (zoom-independent), not absolute size.
- The drawer-vs-canvas A/B comparison is the fastest in-app discriminator for
  canvas rendering questions (the drawer's QuestTile renders outside the node's
  flex column).
- Every "nothing changed" report is checked against the running bundle first
  (HMR died silently mid-session; the frozen 1.4 render fed three fake "too
  big" reads) — the s50 gotcha, second occurrence.

## GOTCHAS: FLEX-SHRINK-PLATE-CLIP
## DECISIONS: PLATE-EQUALS-BODY
