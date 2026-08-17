# Session Handoff — s67 (2026-08-16)

## Status: P1-PARITY closed (icon picker, import/export hardening, description-editor ruling, layout deferral) + P1-PACKINDEX finished. 6 commits pushed, tree clean except the advisor-setup files (untracked, unrelated).

## Commits pushed this session
| Commit | What |
|---|---|
| `1433c70` | feat(quest-editor): book icon picker — FTB `icon: { id }` compound import/export wired; phantom book-level `default_quest_size` REMOVED (game has no such field — only `Chapter.defaultQuestSize`); save-as-file ruled not-a-setting (in-game action `saveLocally()`, covered by Save) |
| `6616afa` | feat(quest-editor): alias unification + quest tags round-trip — canonical keys `min_width`/`invisible`/`invisible_until_tasks` (jar-verified), import accepts legacy aliases, export emits canonical only; FIXED subdirs `invisible_until_completed` bug (game never reads it → invisible quests would render visible); quest `tags` wired (model field existed, pipeline never touched it) |
| `4386fc8` | docs(roadmap): description-editor ruling — editor + multi-page DONE (lines = pages), inline images a PHANTOM (jar: no image key on Quest, description is a plain TextField); exotic-line round-trip LOCKED (`exotic_description_lines_roundtrip_verbatim` — JSON components, links, § codes survive verbatim) |
| `6856509` | docs(roadmap): layout choice DEFERRED with tripwire (student ruling — trigger: version support; 1.21.x only reads FlatChapters, user picker = footgun) |
| `27730a0` | feat(pack-index): finish P1-PACKINDEX — tags wired, determinism + all-legs locked, FIRST CONSUMER shipped (icon-picker "used in" footer); fixture caught a REAL s44 bug (shaped-recipe `key` ingredients never indexed) |

Tree clean at `27730a0` (except `.opencode/agent/advisor.md` + `docs/advisor-agent.md` untracked, `docs/tutor-agent.md` modified — the advisor-agent setup from earlier today, deliberately NOT committed with feature work), pushed, integrity 0, both binaries rebuilt (release + debug; stale-binary gate caught the debug binary mid-arc).

## What we built and why (one line)
Closed P1-PARITY entirely and finished P1-PACKINDEX: every "remaining" roadmap claim was tested against the shipped jar + the round-trip before building, which turned four of six P1-PARITY items into phantoms/staleness/footguns (book default size, save-as-file, inline-image editor, layout choice), one into a real gap with a real bug inside it (aliases/tags), and exposed P1-PACKINDEX as half-built-but-unmarked (s44 spine, no status line, no consumer, parked tags, one silent indexing bug).

## The arc in detail

### 1. Book icon picker (`1433c70`)
- **Ground truth from jar + real data.snbt:** FTB stores the book icon as an ItemStack compound `icon: { id: "..." }` (`QuestObjectBase.rawIcon`), NOT a `book_icon` string. The frontend picker logic already handled `type: 'book'` (`icon-picker.tsx:82-84`) but had NO UI trigger and Rust never imported/exported it.
- **Shipped:** import parses the compound (SNBT + JSON5 arms), export writes it when non-empty, Book Settings gained a "Pick Icon" button (wired to the shared IconPicker) + materialized preview + clear. Round-trip locked in `book_level_settings_roundtrip_through_export`.
- **Phantom removed:** book-level `default_quest_size` — write-only (UI set it, nothing read it), and the game has NO book-level field (`BaseQuestFile` has no `defaultQuestSize`; only `Chapter.defaultQuestSize`, a scalar the chapter flow already round-trips). Student ruled REMOVE (not repurpose) — deleted model field + UI inputs + toolbar/theme passthrough + fixtures. Model field name `book_icon` kept, mapped to game key `icon` at the SNBT boundary (same as `book_progression_mode` ↔ `progression_mode`).
- **Save-as-file:** resolved NOT A SETTING — in-game context-menu action (`saveLocally()`), covered by the app's Save. Roadmap note only.

### 2. Alias unification + quest tags (`6616afa`)
- **Jar-verified canonical keys** (`Quest.writeData`): `min_width`, `invisible`, `invisible_until_tasks`. The repo imported legacy app-emitted aliases (`min_window_width`, `invisible_until_completed`, `invisible_until_x_tasks`) that never match game output → silent round-trip drops.
- **Fix:** import accepts canonical + legacy (same pattern as repeat-cooldown work); export emits ONLY canonical.
- **Real bug found:** the subdirs export wrote `invisible_until_completed` — a key with 0 occurrences in the jar. Invisible quests exported via subdirs layout would render VISIBLE in-game. Fixed: `invisible: 1b` in both layouts. (The flat path was already correct; only subdirs — reachable for pre-1.21 packs — was broken.)
- **Quest tags:** game stores a string list on every quest object (`QuestObjectBase.getList("tags")`). `node.tags` existed in the model but the pipeline never touched it — now parsed (SNBT + JSON5) and exported (both layouts).
- **Locked by** `alias_keys_roundtrip_with_ftb_canonical_names` (legacy + canonical input both round-trip; exported text asserts no legacy keys). Gotcha: SNBT list serializer renders `[ "a", "b" ]` (inline, spaces inside brackets).
- **`chapter_groups.snbt`:** verified DONE (parse + export + per-chapter `group` key + round-trip test existed) — roadmap line was stale, no work. Roadmap flipped.

### 3. Description editor — resolved as mostly-phantom (`4386fc8`)
- Student asked "does it not already have a description editor?" — correct. Editor exists (textarea `quest-detail-panels.tsx:98-105`, inline tile edit `QuestTileBody.tsx:103-120`); multi-page = lines (FTB's "page break" button inserts a newline); **inline images DON'T EXIST in the game** (no image key on Quest, description renders as a plain `TextField`, the only `{image` string in the jar is a legacy editor detection string nothing renders).
- **Real residue:** exotic description lines (JSON chat components, `[link]` URLs, hex-id quest refs, `§` formatting codes) passed through untested — locked by `exotic_description_lines_roundtrip_verbatim`. Note: SNBT serializer escapes internal quotes, so JSON-component lines write escaped — assertion must check the escaped form.
- Roadmap item CLOSED.

### 4. Layout choice — DEFERRED with tripwire (`6856509`, student ruling)
- 1.21.x only reads FlatChapters (`layout_for_version`, jar-verified s42 — a Subdirs pack loads 0 chapters); the production export already forces the version-correct layout (`commands/modpack/ftb.rs:26-39`). A user-facing picker would be a footgun.
- **Student's tripwire is sharper than mine:** trigger = when ADDITIONAL MC version support lands (pre-1.21 CAN read Subdirs). Until then, parked.

### 5. P1-PACKINDEX finished (`27730a0`)
- **The roadmap said "open" — the s44 spine existed unmarked** (`b91a0cc`: models, build, inversion, dead-reference audit, `get_pack_index` command, 4 invert tests). No status line, no consumers, tags parked with a now-stale reason.
- **Tags wired:** canonical `#ns:path` ids + tag→item references through the same dead-reference audit. (Used the public command fns `list_item_tags_cmd`/`resolve_item_tags_cmd` — the `tags` module is private by design; no API widening needed.)
- **Determinism + all-legs locked** (`pack_index/build_tests.rs`, 2 tests): build twice → equal (`PackIndex` gained `PartialEq`); fixture covers items + recipes + tags + quests + a dead reference.
- **REAL s44 bug caught by the fixture:** shaped-recipe ingredients live in `Recipe.key`, `build.rs` only read `.ingredients` → shaped-recipe ingredients were silently missing from the index since s44. Fixed (`key.values()` added), test locks it.
- **First consumer:** icon picker "where is this used" footer — hover an item → recipe/quest/tag usage counts. Fed by `get_pack_index` memoized per project (`services/pack-index.ts`, with `invalidatePackIndex`) + pure reverse-lookup `core/pack-index/item-usage.ts` (4 FE tests). Failure degrades to no footer (never blocks the picker).
- Recipe-editor consumer (the other half of the completion criterion) = follow-up on the same seam.
- **Test-infra gotchas learned this arc:** `tempfile::tempdir()` files die if the TempDir is dropped before the test runs (the registry cache survives in `~/.cache`, the recipe/tag/graph files do NOT); `quest_cache::load` memoizes by `project_id` (use unique ids per fixture); `ItemRegistryEntry.texture_data_url` is `Option`.

## Roadmap state after s67
- **P1-PARITY: CLOSED.** Final: theme-file fidelity (re-scoped s66, tripwire parked), book icon picker DONE, aliases+tags DONE, chapter_groups verified DONE, description editor resolved (editor+multipage DONE, inline images phantom), layout choice DEFERRED (trigger: version support).
- **P1-PACKINDEX: spine + first consumer DONE.** Recipe-editor consumer = follow-up.
- **P1-HEALTH-2:** topology DONE (s44); the quest→item→recipe availability half is parked pending PACKINDEX — **dependency now satisfied, unblocks**.
- **P2-BEHAVIOR:** chunks 1-7 DONE; remaining = in-game verification of the new vocabulary (verify task, not build).
- **P0-DISTRIB:** CI landed s65; release-artifacts pipeline still absent (roadmap §3.3 line 196 still says "No CI" — STALE, found this morning, fix at 08-18 triage).

## Owed explain-backs (invitation-only, never forced)
- s64 fidelity implementation (pending, carried)
- s65 CI fixes — path-safety guard, zip separators, gate fixes (pending, carried)
- s66 ws_ipc extraction (offered, not owed unless invited)
- s66 featureparity migration (offered, not owed unless invited)
- s67 phantom-recognition arc — book default size + inline-image editor + layout choice (NEW, offered, not owed unless invited; the student articulated the "unused field = noise" principle unprompted after the first phantom, and the pattern recurred three more times — strong promotion candidate for the two-source-divergence concept)

## Re-review calendar
- **08-18 (TOMORROW at the time of next session):** version-boundary correctness; offline-first (s59 companion-authoritative ruling is re-examination material); two-source divergence (**promotion candidate — student articulated the phantom pattern unprompted, four times this session**); **doc-sync triage (probe — candidates: 0687e3a, 5d75d75, 931d7a1 + NEW: roadmap §3.3 line 196 "No CI" — fix spec recorded in memory: split the row, CI exists s65, release pipeline still absent); atomic writes; comment preservation.**
- 08-19: 3-layer rule; 08-20: round-trip + CI/verification matrix; 08-21: delegation; 08-24: staleness.
- Spine: comment preservation (P2 row 5, second half) — parked on student's call. No deliberate index work happened this session (build arc) — the doc-sync triage concept was TAUGHT (three classes, fresh specimen) but never probed.

## Booked / parked
- Tutorial readability pass (journey-test remainder — student's own in-app walk, no tester needed).
- Friend-bundle `.flatpak` re-export (s61 loose end).
- P1-HEALTH-2 availability half (now unblocked — needs PACKINDEX consumer plumbing + full objective model).
- P1-PACKINDEX recipe-editor consumer (second half of completion criterion).
- P2-BEHAVIOR in-game vocabulary verification.
- P1-HYGIENE remaining: 300-line splits; HOCON parser arm or drop the docs claim.
- P0-DISTRIB: release-artifacts pipeline (CI done).

## Next session start ritual
1. Read profile + tutor: memories; read this handoff.
2. **08-18 re-reviews are due** (six items; doc-sync triage has four candidates incl. the "No CI" row — all fix-specs recorded in memory).
3. If build work instead: P1-HEALTH-2 availability (unblocked), P1-PACKINDEX recipe-editor consumer, or P2-BEHAVIOR in-game verify.
4. Advisor-agent files are still uncommitted — student's call whether to commit them separately.
