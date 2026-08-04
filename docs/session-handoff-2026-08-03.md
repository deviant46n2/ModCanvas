# Session Handoff — 2026-08-03 (branch `drunk-coding`)

Started by auditing the codebase against AGENTS.md + docs/ (via subagents),
then shipped work in that order. All changes committed; tree is clean.

## Committed tonight

- `d5e233a` feat: book-level settings round-trip through data.snbt
  - 13 new `QuestGraph` fields: `emergency_items` (+cooldown), `lock_message`,
    `show_lock_icons`, `fallback_locale`, `disable_gui`, `pause_game`,
    `drop_book_on_death`, `drop_loot_crates`, `hide_excluded_quests`,
    `verify_on_load`, `default_quest_disable_jei`, `loot_crate_no_drop`.
  - import (Snbt + Json5) / export / TS types / BookSettings UI /
    `book_level_settings_roundtrip_through_export` test / docs updated.
  - Verified: cargo 226 pass, vitest 415 pass, tsc clean, binary rebuilt.
- `36bd932` docs: fixed stale parity/docs claims
  - featureparity.md (book-level settings rows now ✅, chapter_groups ✅,
    theme-parsing note, `quest-form-sections.tsx` → real files, 🏆 label),
    recipe-editor.md (real script filenames `modcanvas_recipes.js` /
    `modcanvas_crafttweaker.zs`; removed nonexistent `recipes-generated.ts`),
    quest-editor.md (undo/redo → shared 200-entry HistoryStore), engine-renders.md.
- `b431b53` chore: removed dead QuestGraph/QuestInspector stack — **9,668 lines, 15 files**
  - Deleted: `QuestGraph.tsx(.css)`, `App.css.bak`, `inspector.tsx`, `toolbar.tsx`,
    `modals.tsx`, `canvas.tsx`, `nodes.tsx`, `QuestInspector.tsx(.css)`,
    `RewardsTab.tsx`, `ObjectivesTab.tsx`, `useGraphUI.ts`, `useGraphData.ts`,
    `useGraphActions.ts`. Verified tsc/vitest/vite build before commit.
- `58c564d` docs: `drunkideas.md` — stretch-goal scratchpad (tiered).

## Audit debt (from tonight's audit — open, NOT fixed)

- **300-line file cap violated** by 41 non-test files (worst: `import.rs` 2528,
  `quest/types.rs` 1241, `QuestCanvas.tsx` 1126). No documented exception.
  Recorded in featureparity.md's audit line.
- **Comment preservation (HIGH):** `snbt.rs` has a comment-preserving AST, but
  `import.rs`→`export.rs` rebuilds every compound comment-free. Quest saves
  wipe pack comments.
- **Version boundary (HIGH):** `export.rs` emits Data Components with no
  target-MC gate; `getSNBTSpec().dataComponents` is unused in production.
- **3-layer rule (MEDIUM):** 4 components fire IPC via `services/api` directly
  instead of hooks.
- Dead-code follow-up to audit sober: `core/quest/progress.ts`, `core/validation/`.

## Suggested next session (sober)

1. Commit not needed — tree clean. Read `drunkideas.md` Tier 1.
2. Best value: comment preservation or version-gated Data Components (both
   parser surgery — do sober).
3. Or theme WYSIWYG from theme-file (`ftb_theme.rs` already parses backgrounds).

## Environment reminders

- Binary rebuild check: `src-tauri/target/debug/modcanvas` mtime vs newest edit.
- Frontend hot-reloads via `pnpm dev`; Rust triggers auto-rebuild there.
- Release embed requires `cargo tauri build --no-bundle`, not plain cargo build.
