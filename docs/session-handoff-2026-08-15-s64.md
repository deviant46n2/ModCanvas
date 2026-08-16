# Session Handoff — s64 (2026-08-15)

## Status: environment crash diagnosed + fixed; the s63 framing thread CLOSED with full clean-room fidelity; background rendered with the game's exact semantics; guiScale support added

## Commits pushed this session
| Commit | What |
|---|---|
| `931d7a1` | **fix(quest-editor): match chapter-open view to the game — framing, theme background, guiScale** (clean-room from FTB Quests v2101.1.31 + FTB-Library v2101.1.35) |
| `eec4aef` | docs(workarounds): flatpak nvidia GLX mismatch after host driver bump (row 14) |

Tree clean, pushed, 464 Rust + 751 FE tests green, tsc + lint clean. Flatpak rebuilt + installed with the new build (verified commit == bundle == install).

## What we built and why (one line)
The editor's chapter-open view now IS the game's view — quest cells at the game's zoom-16 scale (28px/unit), theme background with the game's tile/stretch + vertex-tint semantics (window-space, never cover), 1px `#1B1D1E` panel frame, and the whole default view scaled by the instance's real `guiScale` from `options.txt` — so what you compare against in-game is what you see in the editor.

## The clean-room findings (all from source, not model)
- **Background**: `FTBQuestsTheme.drawGui` draws `ThemeProperties.BACKGROUND` window-space across the full screen rect. `ImageIcon.draw` (FTB-Library): `tile_size` present → repeat at that px; absent → stretch; `color=` is a **vertex tint** (RGB multiply + alpha modulate), NOT an overlay — the white-wash bug. Default theme: `background_squares.png` tiled 64px + `#DCFFFFFF`.
- **Viewport**: default zoom 16 (`QuestScreen.java:60`) = 28px/unit pitch (`zoom*(3/2+spacing/4)`); chapter select → `resetScroll` = center on content; reopen restores persisted view; autofocus overrides.
- **guiScale**: the editor's default view scales by the instance's `options.txt` `guiScale` (1–4, auto/missing → 1). Verified: editor == game at guiScale 1; matches a guiScale-3 instance.

## Key lessons this session
- **Stale-build discipline bit us three times** — the running flatpak kept serving pre-fix code after installs (process start time vs install time is the discriminator). The manifest's "binary must be newer than the newest edit before every wrap" rule is load-bearing; verify `flatpak info --show-commit` == build commit AND the process restarted.
- **`#[tauri::command]` is not registration** — a new command must be added to `lib.rs`'s `generate_handler!`; an unregistered command + a swallowed `.catch(() => {})` = a silent "defaults to 1" bug with no error anywhere.
- **Host nvidia driver bump (610.43.03 → 610.57.04) breaks flatpak game launches** (`GLX: Failed to find a suitable GLXFBConfig`) until `flatpak update` refreshes the sandbox's GL extension. Workaround row 14.
- **The tile_size semantics live in the `; prop=value` options** — `ftb_theme.rs` previously discarded `color`/`tile_size`; the whole rendering decision depended on them.

GOTCHAS: FTB-BACKGROUND-RENDER-SPEC-S64, flatpak-GLX-after-nvidia-driver
DECISIONS: FTB-BACKGROUND-RENDER-SPEC-S64 (supersedes the s61 map-space theory), guiScale-from-options-txt (s64)

## Newly booked (NOT built) — game-fidelity follow-ups (parked with reasons)
- Persisted-viewport restore on reopen (`restorePersistedScreenData`) — the game restores your last view; the editor always re-centers. Parked: default-centering is the safer tool default; revisit if reopen-memory matters.
- Chapter autofocus `scrollTo` — the game scrolls to the chapter's autofocus quest on open. Parked: wizard packs set none; needs a UI affordance to set it first.
- Wheel-zoom clamp 4–28 with center preservation (`withPreservedPos`) — the game clamps zoom and keeps the center quest under the cursor. Parked: ReactFlow's free zoom is an editor affordance; the game's clamp is a display rule.