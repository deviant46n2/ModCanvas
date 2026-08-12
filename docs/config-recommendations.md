# Config Recommendations (P2-CONFIG)

> Status: **s47 — plain-language recommendation search shipped** inside the
> existing "Add a config tweak" wizard. Roadmap §12, class Expand.

## What this is

The config editor's problem is the *name* problem: a user who wants "creepers
not to destroy blocks" shouldn't have to know which file has the setting, let
alone the key name. P2-CONFIG adds a curated plain-language layer: the wizard
now opens on a **recommendation search** (step 0) that maps intent ("keep
inventory", "turn off pvp") to a real config file + key path + typed value,
then applies it through the editor's own history+save path — so every
recommendation is undoable by the existing Undo button.

The classic file → setting → value flow is unchanged, one click deeper
("search config files").

## Architecture (3-layer rule)

| Layer | File | Role |
|---|---|---|
| Thinking (pure) | `frontend/src/core/config/recommendations.ts` | `ConfigRecommendation` type, the curated list, `searchRecommendations(query, files)` |
| Show | `frontend/src/components/common/config-recommendation-search.tsx` | Step 0 surface: query box, matching cards, popular tweaks |
| Show + glue | `frontend/src/components/common/GuidedConfigWizard.tsx` | Step 0 host; pick → open file → pre-fill value form → Apply |

Apply is the wizard's existing contract: `onApply({filePath, path, value})` →
`updateConfigValue` (history-committed) + `saveConfigFile`
(`save_structured_config`) — the same path the manual flow uses. No parallel
generation, no new write path, no second undo stack.

## The recommendation file

`CONFIG_RECOMMENDATIONS` in `core/config/recommendations.ts` is **maintained
data, tiny by design** (roadmap §12 risk: "keep it tiny and
community-extensible"). One entry = one plain-language tweak:

```ts
{
  id: 'keep-inventory',          // stable id
  phrases: ['keep inventory', "don't lose items on death"],
  file: 'server.properties',     // filename matcher (case-insensitive substring)
  path: ['keepInventory'],       // key path inside the file
  value: { type: 'boolean', value: true },  // typed ConfigValue
  why: 'Players keep their items on death…', // shown on the card
  mod: 'vanilla',                // grouping label
}
```

**Adding a recommendation = one array entry + a test.** Search + apply need no
other wiring.

### Fidelity rules

- **File presence is the gate.** A recommendation is surfaced only when its
  target file exists among the pack's scanned config files
  (`recommendationFilePresent`). No dead ends, no applying to files that
  aren't there. Config paths vary by pack/version, so `file` is a
  case-insensitive substring matcher — the scan's relative path
  (`config/server.properties`) is matched against it.
- **Match semantics:** every query token must appear in at least one phrase;
  exact phrase matches rank above containment. Deterministic ordering.
- **Review before apply.** A picked recommendation opens the file and
  pre-fills the value form; the user still sees the typed form and hits Apply.
  Nothing is written without the user's final click.
- **Undoable by construction:** the apply routes through the editor's
  history-committed `updateConfigValue`; the existing Undo button reverts it.

## The shipped list (seed)

Six vanilla `server.properties` tweaks — the pack-independent, verifiable
core (server.properties is the one config file every pack has, and the parser
produces a structured tree for `.properties`):

- keep-inventory, difficulty-hard, command-blocks, pvp-off, spawn-protection,
  view-distance.

The seed is deliberately vanilla-only: mod config paths vary too much to ship
without in-pack verification. Community/extensible entries slot in as one
array entry + test — the structure is the contract, the list is the data.

## Verification

- `pnpm test -- recommendations` — search semantics, file-presence gate,
  list well-formedness.
- `pnpm test -- GuidedConfigWizard` — step 0 flow: search → pick → open →
  pre-fill → Apply through `onApply`; the classic file flow still passes.
- Full gates at commit: `cargo test`, `pnpm test`, `pnpm lint`,
  `pnpm integrity`, binary rebuilt.
