# Session Handoff — s58 (2026-08-14/15)

## Status: texture-index arc COMPLETE + pushed; registry fix SCOPED for next session (MVP)

## Committed this session (both pushed)
- `b40a9eb` — texture-index fix: `layers.rs::vanilla_jars` delegates to
  `indexer::find_vanilla_jars` (single source of truth). Vanilla layer was
  EMPTY for Prism packs (discovery only knew `versions/` + vestigial `.ftba`).
  Live-verified: `minecraft:item/paper` resolves, layer 0 populated.
- `06dab0b` — version-scoped vanilla discovery + engine-upgradeable items (s58):
  - `find_vanilla_jars` now resolves the instance MC version from
    `mmc-pack.json` (authoritative — the file Prism reads to launch) with
    `version.json` fallback; the shared `libraries/net/minecraft/client/`
    sweep accepts ONLY the instance's own version's jar; `~/.minecraft/versions`
    same; NO resolvable version → machine-global sources contribute NOTHING
    (student ruling: **never serve wrong data** — a wrong-version jar is worse
    than no jar). Instance-local sources (`minecraft.jar` at root, in-instance
    `versions/`) always kept (scoped by construction).
  - Engine-upgradeable items: item models carrying their own texture (resolve
    flat offline) but chaining to 3D block geometry get an engine render when
    the companion connects. Cache field `engine_upgrade` (CACHE_VERSION 8→9),
    `scan_engine_upgrade_cmd`, `texture-loader/upgradeable.ts` registry,
    `useUpgradeableQueue` (sibling of `useBakedQueue`), plan.ts inject gate
    (excludes upgradeable keys from the flat inject so s26 can't block the
    engine render). Genuinely-flat items keep the s26 darker-render protection.
  - `vanilla_jar_textures_are_indexed` made FAITHFUL: the old fixture wrote a
    texture onto `item/stone.json` that real vanilla does NOT have (verified
    against client-1.21.1-extra.jar); real stone bakes. The flat-but-3D class
    is the modded pattern (`{"parent":"block/cube_all","textures":{"all":…}}`
    directly on the item model).
  - Tests split to `tests/vanilla.rs` (discovery + version-locks) and
    `tests/upgradeable.rs` (line-limit); `tests.rs` 507→178 lines.
  - Docs: engine-renders.md (version-scoping + upgradeable sections),
    roadmap reactivation entry.

## Verification state (all evidenced)
- 461 Rust tests green; 740 frontend green; integrity clean (only test-file
  stale-binary flags from the test split — shipped binary is current).
- Flatpak rebuilt, ostree rev == installed commit, content markers present.
- LIVE (fresh app, monster pack = 1.21.1 NeoForge): cache regenerated to
  version 9; `minecraft:item/paper` resolves from
  `client-1.21.1-20240808.144430-extra.jar` (was 1.20.1 before the fix);
  14,008 keys; engine_renders has 767 items incl. `minecraft:stone: true`.

## KEY LEARNING — the student caught a wrong-version analysis
The student said "modcanvas only supports 1.21.1, why are you asking about
1.20.1" — the analysis was reading the 1.20.1 client jar (both jars coexist
in the shared libraries dir). That correction exposed the real version-mixing
bug. LESSON: ground truth = instance's OWN metadata (mmc-pack.json), never the
machine's global state. Also: the "stone is flat" premise was a synthetic test
fixture; real vanilla stone has no item-model texture → bakes.

## NEXT SESSION — the item-picker blank/random-textures bug (MVP-scoped)
Student ruled: **this is MVP, must be done, new session.** Fully diagnosed,
NOT yet fixed:

### Symptom (student's eyes, ground truth)
- Item picker: ~50% of items are BLANK (no icon).
- Icon picker (quest appearance selector): shows random textures, not all items.

### Root cause A — registry pollution (the 50% blank)
`scan_instance_items` (indexer/mod.rs:93-105) registers EVERY lang key passing
the `item.`/`block.` prefix filter. The denylist `is_fake_item_key`
(jar.rs:11-18, 16 markers: .tooltip/.desc/.lore/…) can never enumerate all
GUI-key shapes. Live data on monster pack:
- 2411 registry entries; **1498 have NO texture_data_url**; 1093 miss the
  texture index entirely (the blank rows).
- Pollution classes (all verified): FTB Quests GUI keys
  (`ftbquests:chest.input`, `barrier.object.quest_barrier` — registered as
  `block.ftbquests.*`/`item.ftbquests.*`), banner pattern keys
  (`minecraft:banner.base.black`), deprecated aliases + block states
  (`angler_pottery_shard` — 1.20.3 renamed to sherd; lang has BOTH keys, model
  uses `sherd`; `acacia_wall_sign` is a block state, the item is
  `acacia_sign`).

### The TRAP (verified, do not fall into)
A naive "drop entries with no texture_data_url" gate kills the pollution AND
**405 REAL items** (`acacia_button`, `acacia_fence`, `acacia_stairs`,
`allay_spawn_egg`, `ancient_debris`…) that the INDEXER can't resolve but the
TEXTURE INDEX can (model chain: `item/acacia_button.json` → block → texture;
the indexer's `find_texture_for_item` only checks `item/`/`block/`/`model/`
prefixed textures). Two resolution paths diverging — the s57 pattern again.

### Root cause B — icon picker lists raw index
`icon-picker.tsx:23` iterates `Object.entries(textureIndex)` — all 14,008 keys
(bare textures, model-part keys like `acacia_door_top`, bake: descriptors).
Shows first 200 without search → random-looking. Should list the ITEM REGISTRY
(filtered to resolvable), not the raw index.

### Student's ruling (MVP, new session)
**Registry from the companion dump**: the authoritative item list comes from
the companion's in-game item registry (Forge `BuiltInRegistries.ITEM`) when
connected; offline lang scan as fallback. The game lists exactly registered
items with real names — kills pollution AND resolves everything real, because
it's the authoritative source. Companion currently has NO registry dump event
(verified — only RENDER_ITEMS_REQUEST / EXTRACT_TEXTURES_REQUEST /
STOP_INSTANCE in WorkbenchEventHandler.java:34-47). Needs: companion event +
handler (BuiltInRegistries.ITEM, sendEvent), frontend ingest path, Rust merge
+ fallback logic. Also the icon-picker fix (source from registry).

### Scope note
"Major companion expansion" is deferred per AGENTS.md — this is a minor,
well-scoped addition (one event). The s58 roadmap entry reactivated
"additional rendering infrastructure"; the registry dump is arguably within
that booking. Decide the booking in the next session.

### Rejected this session (parked with reasons)
- Engine-upgradeable mechanism: BUILT and committed, but `engine_upgrade` is
  EMPTY on the monster pack (vanilla block items carry no item-model textures
  → already bake). It targets the modded pattern; locked by tests. Not the
  cause of the blank picker.
- "Companion captures ALL textures on connect" (student's earlier idea):
  wrong layer — the engine queue already drains every bake: key while
  connected; flat textures should never need the game. The real gaps are
  registry pollution (this bug) and offline-vs-index divergence.

## Repo state
- Working tree CLEAN, everything committed, pushed.
- Flatpak running the fixed binary (version-scoped, cache v9) with the pack
  loaded — useful for the next session's before/after.
- Memory: profile + tutor/code session + concept + decision records written
  (test-vs-code-staleness → competent; version-boundary-correctness → learning
  08-18; offline-first → learning 08-18).

## Owed explain-backs (invitation-only, never forced)
- 4-line evidence method (declined s58, carried)
- version-scoping design (carried)

## Re-review calendar
- 08-18: version-boundary correctness; offline-first architecture
- 08-19: 3-layer rule; 08-20: round-trip; 08-21: delegation; 08-24: staleness
- Spine P2 row 5 (atomic writes) parked on student's call
- Ghost-chapter game-save ping-pong — candidate decision, parked

## Next session start ritual
1. Read profile + tutor: memories; read this handoff.
2. Open the running flatpak's item picker FIRST — the student's eyes confirm
   the 50% blank before any code.
3. Then: registry-from-companion-dump design (event shape, fallback policy,
   picker source change).
