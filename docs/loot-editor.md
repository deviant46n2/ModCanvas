# Loot Table Editor (P3-LOOT)

> Status: **s47 — editor shipped** (pools, rolls, entries, weights, conditions,
> JSON emission, Pack-Index-style item validation). Read-only scan MVP from s44
> is the foundation; this doc covers the editor layer built on it.
>
> **s72 (B1) — vanilla surfacing + copy-to-pack:** the scan also reads the
> vanilla game jar's tables when the instance path is known (a zero-mod pack
> gets loot to work with), and read-only jar tables can be copied into the
> pack's own `data/` to become editable.

## Scope

Loot tables are the "what drops" surface: chests, blocks, entities, and
advancement rewards are driven by `data/<ns>/loot_table(s)/*.json`. The editor
lets a pack author adjust weighted pools without hand-writing datapack JSON —
and create new tables in the pack's own `data/`.

Roadmap completion criteria (§13 P3-LOOT):

- [x] Weighted pools (rolls — count, uniform range, or opaque exotic provider)
- [x] Conditions (typed forms for the common five, opaque raw-JSON for the rest)
- [x] Emits real JSON (verbatim save, structurally validated)
- [x] Pack Index validated (item references graded against the item universe)
- [x] New-table creation (version-derived dir via the adapter matrix)
- [x] Vanilla jar surfacing + copy-to-pack (B1, s72) — zero-mod packs have editable content

## Architecture (3-layer rule)

| Layer | File | Role |
|---|---|---|
| Thinking (pure) | `src-tauri/src/loot/model.rs` | `LootTable`/`LootPool`/`LootEntry`/`LootRolls` — typed model with preserve-unknown |
| Thinking (pure) | `frontend/src/core/loot/model.ts` | Frontend mirror of the Rust model: parse/serialize + `extra` maps |
| Thinking (pure) | `frontend/src/core/loot/validation.ts` | Item-reference grading against the item universe |
| Thinking (pure) | `frontend/src/core/loot/conditions.ts` | Typed condition views (5 typed forms, opaque fallback) |
| Hands (I/O) | `src-tauri/src/loot/mod.rs` + `pack_scan.rs` | `scan_loot_tables_cmd` — pack `data/` + mod jars + the vanilla jar (when the instance path is known), deduped by resource id |
| Hands (I/O) | `src-tauri/src/loot/editor.rs` | `read_loot_table_cmd` + `save_loot_table_cmd` (path-safe, atomic) |
| Hands (I/O) | `src-tauri/src/loot/create.rs` | `create_loot_table_cmd` + `copy_loot_table_to_pack_cmd` — dir whitelist, ns/name validation, no-clobber, shared write tail |
| Hands (I/O) | `frontend/src/services/loot.ts` | IPC wrappers for scan/read/save/create/copy + starter-table JSON |
| State | `frontend/src/hooks/useLootEditor.ts` | Load → edit → save state machine, honest statuses |
| Show | `frontend/src/components/loot/LootTableEditor.tsx` + `loot-entry-row.tsx` + `LootConditionList.tsx` | The editor surface; LootTab hosts it for editable tables |

The Rust model is the contract; the frontend mirror must stay in lockstep
(doc-sync: a model change lands in both files, same pass).

## The fidelity contract

Loot JSON is **not** SNBT: there is no byte-identical round-trip promise. The
bar is **fields survive, not bytes survive** (the s2–3 lesson, applied to
JSON). The mechanism:

- Every modeled container (`LootTable`, `LootPool`, `LootEntry`) carries an
  `extra` map via serde `#[serde(flatten)]` / the mirror's `pickExtra`.
- Unknown fields at any level — custom pool fields, unknown condition
  internals, entry-level extras — land in `extra` and are re-emitted
  unchanged.
- `rolls` is a three-arm untagged enum: `Count(Number)` (int-vs-float
  representation preserved), `Uniform{min,max}` (with its own `extra`), and
  `Other(Value)` — any exotic provider (e.g. `{"type":
  "minecraft:binomial", ...}`) survives opaquely and the editor shows it
  read-only. **Parse never fails on a shape we don't model.**
- `conditions` and `functions` are opaque `Vec<Value>` — the MVP editors
  add/remove whole blocks, never their internals (scoping decision).

Serialization keys are re-emitted alphabetized (serde_json `Map` is a
BTreeMap). The game parses JSON objects regardless of key order.

Round-trip is locked by tests: `loot/model.rs` (Rust) and
`frontend/src/core/loot/model.test.ts` (TS) both assert parse → serialize →
parse stability and unknown-field survival.

## Read / Save path

- `read_loot_table_cmd(project_path, source)` returns the table as its
  canonical model (`Value`). Rejects non-JSON and non-modelable shapes
  (missing/non-array `pools`).
- `save_loot_table_cmd(project_path, source, content)` validates the incoming
  JSON still parses as a modelable `LootTable` (so the write never lands a
  broken table), then writes **verbatim** via the atomic write path
  (`path_safety::atomic_write_str` — tmp-file + rename, Windows EBUSY retry).
  Nothing is re-keyed or reformatted on save: an untouched table produces an
  unchanged file.

**Path gate — important.** Loot tables live in `<root>/data/...` — the
project root, not `config/`. `save_loot_table_cmd` resolves through
`validate_under_root` (root-scoped), **never** `validate_project_write`
(config-scoped). The s45 regression lock (`path_safety/validation.rs`) and
the behavior datapack emitter (`behavior/emit.rs`) use the same gate for the
same reason. The `loot_table` vs `loot_tables` directory name is preserved by
construction — the scanned `source` path carries it.

**Version boundary:** reading scans both dir names. Writing edits in place, so
the dir name is preserved. **Creating a new table** uses the adapter matrix:
`IMinecraftVersionAdapter.getLootDirName()` returns `loot_table` (1.21+) or
`loot_tables` (pre-1.21), locked per-version in `adapters/matrix.test.ts`. The
frontend passes the adapter-derived dir to `create_loot_table_cmd`; Rust
re-validates it against the whitelist (`LOOT_DIR_NAMES`) so a frontend bug can
never write an unvalidated path component. Create validates namespace/name as
a safe resource path (traversal refused, name must be the extension-less
resource path), refuses to clobber an existing table, and writes atomically.

## Vanilla surfacing + copy-to-pack (B1, s72)

The s72 MVP ruling: the Loot tab must work for a **zero-mod pack**. Two
mechanisms:

- **Vanilla jar surfacing.** `scan_loot_tables_cmd` takes an optional
  `instance_path`. When known, `find_vanilla_jars` (the item indexer's
  version-scoped resolver, `indexer/vanilla.rs`) locates the instance's game
  jar and its tables are scanned **after** mod jars, so the existing
  `dedupe_by_resource_id` (first non-editable wins, editable always wins)
  yields **pack data > mod jars > vanilla** — matching in-game source order.
  Vanilla tables carry `vanilla: true` so the UI badges them without
  path-sniffing. No instance path → no vanilla tables (graceful, never wrong).
  The frontend passes `project.path` — for Prism projects that IS the
  instance's `minecraft` dir (`commands/project/lifecycle.rs`), the same path
  the texture/engine pipeline already treats as the instance path.
- **Copy-to-pack.** `copy_loot_table_to_pack_cmd(project_path, source,
  dir_name)` reads the jar entry behind a `jar:<abs>!<internal>` descriptor,
  derives the target id via `loot_id_from_jar_entry`, and writes through the
  SAME tail as create (`write_new_pack_table`): dir whitelist, namespace/name
  path validation, no-clobber, atomic write. A copied table becomes editable
  pack data — the UI selects and opens it immediately after copying.

## Item validation (Pack Index)

`frontend/src/core/loot/validation.ts` walks every `minecraft:item` entry
(top-level and group/alternatives children) and grades its `name` against the
item universe — the same `scan_instance_items` set the Pack Index builds from
(`pack_index/build.rs` step 1). Validating against it IS validating against
the Pack Index's reference universe, without a full index build per save.

- Other entry types (`tag`, `loot_table`, `dynamic`, `empty`) reference
  non-item ids and are not graded.
- Findings are **warnings, never a save gate** (the s46 lesson): a dead id can
  be a KubeJS-registered item the index missed, a data-component item, or an
  actual mistake. The editor surfaces them with a human location
  (`pool 1 · entry 3`); the user decides.

## Editor surface

`LootTab` lists tables; selecting an **editable** (pack `data/`) table opens
the editor. A **+ New table** button opens the create form (namespace +
resource path; the adapter-derived dir is shown live); creating selects the
new table immediately. Jar tables — mod **or vanilla** — stay read-only (a jar
cannot be edited in place) but carry a **Copy to pack** action: the table
lands in the pack's `data/` under the adapter-derived dir and opens in the
editor. The editor offers:

- Pools: add/remove, rolls (count / min–max / opaque), bonus rolls.
- Entries: item entries pick through the shared `ItemBrowser` (via
  `RecipeItemPicker`); weight/quality fields; type select (item, tag, loot
  table, empty, group, alternatives, dynamic); remove.
- Conditions: typed forms for `survives_explosion`, `killed_by_player`,
  `random_chance`, `random_chance_with_looting`, `weather_check` (typed in
  `core/loot/conditions.ts` — adding a condition type = one entry + a test);
  everything else shows as an opaque read-only row (removable) and can be
  added via a raw-JSON textarea. Typed edits write only the typed key, so
  unknown condition internals survive (fidelity contract untouched).
- Save: honest states only (idle/loading/ready/saving/saved/error) — never a
  fake success. Unsaved-changes indicator.

## Known deviations / follow-ups

- `useBehaviorItemPicker` (shared with the Behaviors tab) hardcodes
  `getAdapter('1.21.1', 'neoforge')` for the KubeJS namespace
  (`hooks/useBehaviorItemPicker.ts:27`). For loot this only affects
  `kubejs:`-registered item ids in the picker/validation universe. **Parked
  with this written reason:** the fix is an adapter-driven namespace
  (like `QuestBookEditor` derives it from `minecraftVersion`/`modLoader`),
  touching a shared hook used by two tabs — one-pass fix, not loot-arc scope.
  Tripwire: next time the Behaviors tab or loot tab touches picker wiring.
- Typed editors for the full condition registry: deliberately bounded to the
  five common conditions. Every other condition stays opaque (read-only,
  removable, raw-JSON addable) — the fidelity contract holds either way.
  Adding a typed condition = one entry in `core/loot/conditions.ts` + a test.

## Verification

- Rust: `cargo test loot::` — model round-trips, exotic rolls survival,
  read/save commands, verbatim write, escape refusal, vanilla scan order +
  dedupe (zero-mod surface, pack-wins, no-instance = no vanilla), copy-to-pack
  (verbatim copy, no-clobber, traversal-shaped jar entries refused).
- Frontend: `pnpm test -- loot` — model mirror round-trips, validation walk,
  LootTab badges (vanilla vs jar vs pack) and the copy flow (passes the
  instance path, refreshes, opens the copied row, surfaces failures).
- Full gates at commit: `cargo test`, `pnpm test`, `pnpm lint`, `pnpm
  integrity` (line-limit, asset-bundle, stale-binary, doc-sync), binary
  rebuilt + mtime-verified.
