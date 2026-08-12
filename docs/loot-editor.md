# Loot Table Editor (P3-LOOT)

> Status: **s47 — editor shipped** (pools, rolls, entries, weights, conditions,
> JSON emission, Pack-Index-style item validation). Read-only scan MVP from s44
> is the foundation; this doc covers the editor layer built on it.

## Scope

Loot tables are the "what drops" surface: chests, blocks, entities, and
advancement rewards are driven by `data/<ns>/loot_table(s)/*.json`. The editor
lets a pack author adjust weighted pools without hand-writing datapack JSON.

Roadmap completion criteria (§13 P3-LOOT):

- [x] Weighted pools (rolls — count, uniform range, or opaque exotic provider)
- [x] Conditions (opaque add/remove — scoping decision, see below)
- [x] Emits real JSON (verbatim save, structurally validated)
- [x] Pack Index validated (item references graded against the item universe)

## Architecture (3-layer rule)

| Layer | File | Role |
|---|---|---|
| Thinking (pure) | `src-tauri/src/loot/model.rs` | `LootTable`/`LootPool`/`LootEntry`/`LootRolls` — typed model with preserve-unknown |
| Thinking (pure) | `frontend/src/core/loot/model.ts` | Frontend mirror of the Rust model: parse/serialize + `extra` maps |
| Thinking (pure) | `frontend/src/core/loot/validation.ts` | Item-reference grading against the item universe |
| Hands (I/O) | `src-tauri/src/loot/editor.rs` | `read_loot_table_cmd` + `save_loot_table_cmd` (path-safe, atomic) |
| Hands (I/O) | `frontend/src/services/loot.ts` | IPC wrappers for scan/read/save |
| State | `frontend/src/hooks/useLootEditor.ts` | Load → edit → save state machine, honest statuses |
| Show | `frontend/src/components/loot/LootTableEditor.tsx` + `loot-entry-row.tsx` | The editor surface; LootTab hosts it for editable tables |

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
the dir name is preserved. Creating a *new* table is NOT in the MVP (needs a
version-derived dir choice — flagged as follow-up, not silently skipped).

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
the editor. Jar tables stay read-only — a jar cannot be edited in place. The
editor offers:

- Pools: add/remove, rolls (count / min–max / opaque), bonus rolls.
- Entries: item entries pick through the shared `ItemBrowser` (via
  `RecipeItemPicker`); weight/quality fields; type select (item, tag, loot
  table, empty, group, alternatives, dynamic); remove.
- Conditions: opaque add/remove. One template ships (`survives_explosion`);
  existing condition blocks are shown and removable, never edited inside.
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
- New-table creation (version-derived `loot_table` vs `loot_tables` dir):
  follow-up, needs the version boundary wired through (Rust-side
  VersionProfile or the project's `minecraft_version` from the DB).
- Typed condition editors (per-condition forms): deliberately out of MVP
  scope; the opaque add/remove meets the roadmap's "conditions" bar.

## Verification

- Rust: `cargo test loot::` — model round-trips, exotic rolls survival,
  read/save commands, verbatim write, escape refusal.
- Frontend: `pnpm test -- loot` — model mirror round-trips, validation walk.
- Full gates at commit: `cargo test`, `pnpm test`, `pnpm lint`, `pnpm
  integrity` (line-limit, asset-bundle, stale-binary, doc-sync), binary
  rebuilt + mtime-verified.
