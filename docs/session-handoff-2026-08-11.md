# Session Handoff — 2026-08-11 (s43: hotswap arc completion + quest-editor squish fix)

Branch `new-features`. Tree is clean; all work committed. Two arcs today, both closed.

## WHAT WE BUILT (one line)

Hotswap became a verified, honest end-to-end loop — save reloads the in-game quest book
with evidence-gated PASS reporting, and the quest editor no longer collapses when the
game launches (WebKitGTK flex child-insertion, fixed by absolute-fill).

## DONE

- `a4b3857` — fix(quests): per-type hotswap gates, honest save messages, hub-restart gate
  - `core/sync/config.ts`: `HOTSWAP_FROZEN` → per-type gates (`QUEST_HOTSWAP_ENABLED`,
    `KUBEJS_HOTSWAP_ENABLED=false` until its reload evidence is probed).
  - `useQuestToolbarActions`: wsStatus now live from hub status pushes (the mount-snapshot
    bug drove every save into `wsIpcRestart`); hub restarts only when the hub itself is
    down (`companionState.serverUp`), never on the companion flag.
  - `useRecipeSave`: honest "restart to apply" for the still-frozen KubeJS path.
  - Tests: hub-restart regression + silent-divergence guard (4 tests).
  - Verified: tsc 0, lint 0 errors, 651/651.
- `6130b75` — feat(companion): close+reopen the quest book across reloads
  - `handleQuestReload`: if the book is open, close → dispatch reload → reopen once the
    reload sync lands. Reopen via FTB's own `openGui` (keybind path, reflection — no FTB
    dependency). 600ms off-thread delay after the server reload completes so the CLIENT
    sync applies; reopens over the vanilla pause menu only, never a user-opened screen.
  - E2E: five cycles, three real bugs found (see GOTCHAS). Verified in-game: book
    closes, reloads, reopens fresh, no red X, no "quests locked", no pause-menu block.
  - App evidence loop untouched — save message still PASS/FAIL from the log line.
- `e4b2bbb` — docs: roadmap §13 s43b status + quest-editor Save flow + workarounds #9.
- `1ebeabe` — fix(quests): quest editor collapses on game launch
  - Root cause: engine-render prompt appears at the title screen (companion connects),
    inserting a flex child into `.quest-editor` → WebKitGTK fails to re-propagate the
    flex-grown height → editor collapses to the chapter tree's content height (~140px).
  - Two links: tabpanel `height: 100%` in `app-mods.css` (outside the components/quest/
    guard — the guard-scope failure mode again) AND the flex child-insertion itself.
  - Fix: `.quest-editor` absolute-fills (`inset: 0` against `#tabpanel-quests { position:
    relative }`) — the same pattern `.react-flow` already used. Tabpanel now flex-fills.
  - Verified: reproduced with a fresh app (title screen → prompt → canvas holds); the
    earlier tabpanel-only change demonstrably failed the restart test.

## IN-FLIGHT

None — working tree clean, four commits, all verified.

## PENDING (owed — student's invitation only, never gated)

- Explain-back: the close/reopen design (openGui vs open_book, the 600ms, PauseScreen-only
  override). Offered at s43 close; the student asked the tutor to defend it instead —
  the defense conversation happened; the student-side explain-back is still owed.
- Monster dependency lines in-game: a626ac2 id re-base landed; never confirmed lines drew
  after re-adding an edge. Two-minute check next time in-game.
- Release binary stale (integrity violation): dev-mode workflow; build before any real
  ship. NOT new debt.

## UNVERIFIED CLAIMS

- None claimed without evidence this session: every fix shipped with md5/mtime/javap or
  in-game reproduction (the s14 verification loop, exercised ~10 times today).

## DECISIONS (memory pointers)

- Quest-book reopen via client-side `openGui` + delayed, NOT `ftbquests open_book`
  (raced, unproven). [code:decision: s43 decision (companion quest-book reopen)]
- WebKitGTK flex child-insertion is a real failure class → absolute-fill pattern for
  editor-level sizing. [code:gotcha: s43 verified gotcha (WebKitGTK flex child-insertion)]
- Parked: own-questing-mod / "companion does everything" idea — bounded integration tax
  now (adapter matrix), unbounded rewrite parked with tripwire (post-MVP, user-base
  driven). Conversation recorded, not committed.

## GOTCHAS (memory pointers)

- FTB Library wraps every GUI in a vanilla ScreenWrapper — the book is never the vanilla
  Screen. [code:gotcha: s43 verified gotcha: FTB Library wraps EVERY GUI...]
- FTB quest reload has TWO completion moments — the client applies the sync AFTER the
  server reload completes; reopening in the window renders "quests locked".
  [code:gotcha: s43 verified gotcha (timing): FTB Quests reload...]
- pauseOnLostFocus opens the vanilla PauseScreen the moment the book closes (user saves
  from the app). [code:gotcha: s43 verified gotcha (vanilla): singleplayer pauseOnLostFocus...]
- WebKitGTK flex child-insertion: flex-grown heights don't re-propagate on child insert;
  absolute-fill is the bulletproof pattern. [code:gotcha: s43 verified gotcha (WebKitGTK
  flex child-insertion)]
- Guard scope is a recurring failure mode: the s38 invariant's grep guard covered
  `components/quest/` but the fragile link sat in `styles/app-mods.css`. When touching
  layout, grep the whole chain.

## Environment reminders

- Binary rebuild check: `src-tauri/target/debug/modcanvas` mtime vs newest edit.
- Companion changes: `./gradlew build` → deploy to instance → md5 verify → FULL game
  restart (mods load once) — the s14 loop; done ~6 times today.
- Frontend hot-reloads via `pnpm dev`; CSS edits hot-apply, but a fresh app restart is
  the reliable test after CSS chain changes (HMR proved unreliable today).
- `pnpm integrity` flags the stale release binary (parked, dev-mode workflow).
