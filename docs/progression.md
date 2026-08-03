# Progression Editor

The Progression screen is a node-graph editor (React Flow) for mapping a
pack's content flow: milestones, unlocks, phases, achievements, and content
introductions connected by prerequisite edges.

## Vanilla Template

A research-grounded template demonstrates the screen with a detailed vanilla
Minecraft journey based on the **official vanilla advancement tree** (all five
tabs). It is **not** generated from installed mods (the separate "Load from
Pack" button covers that); it is a hand-authored, static progression tree.

- Source: `frontend/src/core/progression/vanilla-template.ts` (pure data —
  `buildVanillaTemplate(projectId)` returns a full `ProgressionGraphData`).
- Trigger: **Vanilla Template** button in the ProgressionToolbar.
- Content: ~60 nodes across 5 phases modeled on the advancement tabs
  (`The Story` = Minecraft tab, `The Nether`, `The End`, `Adventure`,
  `Husbandry`), each with a canonical item `icon`, `item_refs`, and a real
  in-game `description`; ~55 prerequisite edges. Nodes reference the actual
  items (iron pickaxe, blaze rod, elytra, wither skull, mace, trial key…).
- Layout: phases are laid out in five distinct columns (left → right); each
  phase's nodes are spread down its column with auto-spacing so nothing
  overlaps.

## Persistence round-trip

The backend `ProgressionNode` only persists a `data: HashMap<String,String>`
map — it has no `phase`/`icon`/`color`/`chapter_id` fields. To keep those UI
fields across save/load:

- On save, `ProgressionGraph.saveGraph` stashes them (and JSON-encoded
  `item_refs`/`mod_refs`) into the node's `data` map.
- On load, `ProgressionGraph.toRfNodes` reads them from the top level first,
  falling back to the stashed `data` values.

Without this, phase/icon/color silently disappear after reload.

## Tests

`frontend/src/core/progression/vanilla-template.test.ts` verifies the template:
five advancement-tab phases present, per-phase node minimums, every node has a
phase + icon + item refs, every edge references a real node id, distinct phase
columns, Nether/End reachable only after prerequisites, and namespaced unique
item refs.

## Styling

`frontend/src/ProgressionGraph.css` styles the panel, toolbar, node cards,
inspector, and the ReactFlow surface. The canvas gets its height from the
`.progression-panel { height: 100% }` chain (the workspace tabpanels are
`height: 100%` flex columns), so the graph is visible without any scroll
hijacking.

## Tab navigation note

All workspace tabs stay mounted (inactive panels are hidden with `display:
none`), so the tabs are **always navigable** — the old `tabsDisabled` gating
(which disabled every tab whenever the active tab wasn't `mods` and the pack
wasn't loaded) was removed. This means the vanilla template — which is pure
data and needs no loaded pack — can be viewed, and you can switch to any tab
at any time. Panels without a loaded pack simply show their empty states.
