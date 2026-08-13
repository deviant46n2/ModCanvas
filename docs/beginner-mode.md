# Beginner Mode (P0-BEGINNER)

> Status: **s47 — shipped.** Roadmap §9.6, class New. Closes the P0 gate:
> beginner mode is the last P0 UX feature.

## What this is

The app is an IDE. A first-timer who wants to *make a pack* doesn't need an
IDE — they need the code-shaped surfaces (raw config textareas, generated
KubeJS/CraftTweaker script previews) hidden, and one obvious way to get the
full tool back. Beginner Mode is that switch.

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

## Architecture

| Layer | File | Role |
|---|---|---|
| I/O | `src-tauri/src/commands/settings.rs` | `get_app_setting` / `set_app_setting` — thin IPC over the key/value `settings` table |
| I/O | `frontend/src/services/settings.ts` | IPC wrappers + `BEGINNER_MODE_KEY` |
| State | `frontend/src/hooks/useBeginnerMode.ts` | Reads the flag on mount (null until resolved), persisted toggle with honest-state revert |
| State | `useAppState.ts` | Composes the hook; threads `beginnerMode`/`setBeginnerMode` to the workspace |
| Show | `topbar.tsx` | The prominent toggle (`Beginner mode: on/off`, `aria-pressed`) |
| Show + glue | `ProjectWorkspace.tsx` | Threads the flag to `ConfigsTab` + `RecipeEditor` |

## Honest-state rules

- **Unknown until read.** `beginnerMode` starts `null`; the topbar toggle
  renders only after the setting loads, so surfaces never flash between
  modes.
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
- Full gates at commit: `cargo test`, `pnpm test`, `pnpm lint`,
  `pnpm integrity`, binary rebuilt.
