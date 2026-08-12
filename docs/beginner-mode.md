# Beginner Mode (P0-BEGINNER)

> Status: **s47 — shipped.** Roadmap §9.6, class New. Closes the P0 gate:
> beginner mode is the last P0 UX feature.

## What this is

The app is an IDE. A first-timer who wants to *make a pack* doesn't need an
IDE — they need the code-shaped surfaces (raw config textareas, generated
KubeJS/CraftTweaker script previews) hidden, and one obvious way to get the
full tool back. Beginner Mode is that switch.

**Onboarding turns it ON for first-timers** (the wizard's Done writes
`beginner_mode=1`); returning users default to the full IDE. The toggle is
**prominent in the topbar** — never a buried setting — so the mode can't
become a trap.

## First-boot routing (s48)

A brand-new install (no projects, `first_boot_seen` unset) gets the First-Pack
wizard **auto-opened** instead of a passive "No projects yet" launcher — the
wizard is the entry point that scaffolds the tutorial pack and turns Beginner
Mode on at Done. Guardrails in `useFirstBootRouting.ts`:

- waits for a **successful** project-list load — a failed load never opens the
  wizard (an empty list is ambiguous until the load succeeds);
- fires **exactly once** (ref guard): the flag is written when the wizard
  opens, so a crash, restart, or closing-without-creating never re-triggers;
- returning users (any projects) are skipped permanently.
- key: `first_boot_seen` in the same settings table as `beginner_mode`.

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
| State | `frontend/src/hooks/useFirstBootRouting.ts` | One-shot auto-open of the First-Pack wizard for a fresh install (`first_boot_seen`) |
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
