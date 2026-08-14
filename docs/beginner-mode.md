# Beginner Mode (P0-BEGINNER)

> Status: **s53 — the coach.** Roadmap §9.4, class New. Hiding shipped s47;
> the hint strip (the coach) shipped s53 under the s52 REDESIGN ruling
> (audit finding #11: *"the mode hides code; it does not guide"*).

## What this is

The app is an IDE. A first-timer who wants to *make a pack* doesn't need an
IDE — they need the code-shaped surfaces (raw config textareas, generated
KubeJS/CraftTweaker script previews) hidden, one obvious way to get the full
tool back, and a guide through the first-pack journey. Beginner Mode is that
switch **and** that guide.

- **Hiding (s47):** code-shaped surfaces are hidden or forced to structured.
- **The hint strip (s53):** a persistent coach showing the wedge journey —
  *follow the guide → save your work → fix what Pack Health found → launch*.
  This is the roadmap's parked "hint strip in Beginner Mode" chunk (§9.5),
  un-parked by the s52 REDESIGN ruling. The strip is the mode's answer to
  "the mode hides code; it does not guide": it points at the surfaces the
  journey uses, and its states come from real app signals — it never guesses.

**Onboarding turns it ON for first-timers** (the intro template's finish writes
`beginner_mode=1`); returning users default to the full IDE. The toggle is
**prominent in the topbar** — never a buried setting — so the mode can't
become a trap. The mode is a *user choice* at project start: the intro path
lands in Beginner Mode, the IDE-tour and blank paths start with the full IDE
on. It is never decided by first-run detection.

## What it hides

| Surface | Beginner mode | Where |
|---|---|---|
| Config editor: Raw mode toggle + raw textarea | Hidden; forced to structured; unparseable files get a plain explanation | `ConfigsTab.tsx` |
| Recipe editor: generated script preview + Script toggle | Hidden; toggle not offered | `RecipeEditor.tsx` + `RecipeEditorHeader.tsx` |

Everything else (mods, quests, loot, behaviors, health) is already
no-code-shaped and stays as-is.

## What it shows — the hint strip (the coach)

A persistent strip above the workspace tabs, visible only in Beginner Mode.
Four steps, in the wedge order (mirroring the intro template's own lesson
order — the in-pack guide and the app-shell coach agree):

| Step | Copy intent | State source |
|---|---|---|
| 1. Follow the guide | Open Quests; with chapters: "follow the quests inside"; without: "build your quest book" | Always actionable — **never claims completion** (no in-game quest tracking exists) |
| 2. Save your work | Press Save in the top bar; saving writes your quests into the pack | Always actionable |
| 3. Fix what Pack Health found | Blocking: "N problems must be fixed before launch"; non-blocking: "N things worth a look"; clean: "ready to test" | The Pack Health report — **real** |
| 4. Launch your pack | Press Test (top bar) — it starts the game with the companion attached | The connection pill — **real**, and only what the app owns (external launches are not tracked) |

**The live quest invitation (s53):** the guided "add your first quest" teaching moment moved
out of the pre-launch wizard (it fired before any game data existed → an empty item picker)
to the live surface: on the first companion connect of a session in Beginner Mode, the quest
editor shows a banner — "Your pack is running — add a quest and watch it change in-game" —
that opens the guided-quest mini-wizard, where the picker is full (game downloaded → real
registry + textures) and hotswap is on display. Per-session dismiss; Beginner Mode gating
keeps it off veteran surfaces (ide-tour, blank, full-IDE users never see it).

Honest-state rules specific to the strip:

- **The guide step never claims done.** The app does not track in-game quest
  progress; a coach that guessed "you're done" would be a lie. It points.
- **Nothing-checked is not "all good".** When the report is empty because
  nothing was analyzed (no quest graph, nothing scanned), the strip says
  "nothing to report yet" — never "your pack is ready".
- **No template claims.** `template_id` is not persisted on a project, so the
  strip never claims specific guided quests exist — the copy adapts to what
  the quest graph actually shows.
- **Launch claims only what we own.** "Your pack is running" only when the
  companion is connected; "no instance launched from ModCanvas" is never
  stated as "no instance running" (same rule as the connection pill).

## Architecture

| Layer | File | Role |
|---|---|---|
| I/O | `src-tauri/src/commands/settings.rs` | `get_app_setting` / `set_app_setting` — thin IPC over the key/value `settings` table |
| I/O | `frontend/src/services/settings.ts` | IPC wrappers + `BEGINNER_MODE_KEY` |
| State | `frontend/src/hooks/useBeginnerMode.ts` | Reads the flag on mount (null until resolved), persisted toggle with honest-state revert |
| State | `useAppState.ts` | Composes the hook; threads `beginnerMode`/`setBeginnerMode` to the workspace |
| Pure | `frontend/src/core/beginner/steps.ts` | `deriveCoachSteps` — the strip's steps as a pure function of the report + connection signals + quest graph (no UI, no IPC) |
| Show | `frontend/src/components/common/BeginnerHintStrip.tsx` | The coach strip: reads the Pack Health context + store, renders the four steps |
| Show + glue | `ProjectWorkspace.tsx` | Threads the flag to `ConfigsTab` + `RecipeEditor`; renders the strip (inside `PackHealthProvider`) when `beginnerMode === true` |
| Show | `topbar.tsx` | The prominent toggle (`Beginner mode: on/off`, `aria-pressed`) |

## Honest-state rules

- **Unknown until read.** `beginnerMode` starts `null`; the topbar toggle
  renders only after the setting loads, and the strip renders only when the
  flag is `true` — surfaces never flash between modes.
- **Never claim what didn't persist.** The toggle sets optimistically and
  reverts on a failed `set_app_setting` — the UI never shows a mode the disk
  doesn't have.
- **Onboarding writes, doesn't force.** The wizard's Done sets `beginner_mode=1`
  but the user can flip it off from the topbar at any time.

## Persistence

The flag lives in the app-scoped `settings` table (`db.rs` — same table as
the CurseForge key), key `beginner_mode`, value `"1"`/`"0"`. It is a *user*
preference, not per-project — one mode for the whole app.

## Verification

- Rust: `db::tests::generic_setting_round_trips_and_overwrites` — the
  settings get/set layer.
- Frontend: `useBeginnerMode.test.ts` (read, default-off, persist, honest
  revert) + `topbar.test.tsx` (toggle render, aria-pressed, change handler).
- Coach: `core/beginner/steps.test.ts` (order, guide/save never-done,
  health branching incl. the nothing-checked discriminator, launch signals)
  + `BeginnerHintStrip.test.tsx` (four steps, jump buttons, state pills).
- Full gates at commit: `cargo test`, `pnpm test`, `pnpm lint`,
  `pnpm integrity`, binary rebuilt.

## Parked remainder (written reasons)

- **The driver (roadmap §9.5):** tutorial quests jumping to the surfaces they
  teach needs quest-editor → workspace tab wiring — the direction the roadmap
  named as the rat's-nest. Tripwire stands: revisit when a fresh-eyes user
  test shows the strip's pointers aren't enough.
- **Simplified preset forms (roadmap §9.4 "shows simplified forms instead"):**
  configs as preset forms were never built; the mode hides raw surfaces but
  shows no forms *instead*. Parked — the strip is the guidance; preset forms
  are a separate surface simplification.
