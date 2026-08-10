---
name: design-review
description: The ModCanvas visual design review — grounded in docs/design.md, the repo's single source of truth for the design system. Load before any frontend styling work (new UI, theme passes, node/canvas styling, token changes) and before reviewing UI code. Enforces token usage, the dark-only dev-tool aesthetic, and the anti-slop checklist against the repo's own decisions, not generic web taste.
---

# ModCanvas Design Review

The repo's design system lives in **`docs/design.md`** — read it before
anything else. Every rule below is a *check against the repo's own system*,
not generic design taste. The system is the spec: a dark-only, dense,
professional game-dev tool aesthetic (Unity/Godot/Blender), zinc surfaces,
one cool-blue accent, sharp radii, pixelated textures.

## When to load this skill

- Any frontend styling change: new component, theme pass, canvas/node
  styling, token edits, CSS additions.
- Reviewing a UI diff (self-review or someone else's).
- Proposing a visual direction: the direction must be *defensible against
  design.md*, not "what looks good generically".

## The process

1. **Read `docs/design.md` first.** Name the aesthetic and the tokens before
   touching any CSS.
2. **Ground every proposal in tokens.** Every color/space/radius/type size in
   a proposal must be a named token from `App.css` `:root` (§2 of design.md).
   If a needed value isn't a token, the proposal is to ADD a token to the
   system (App.css + design.md together, same pass) — never an inline value.
3. **Match the sibling.** New UI must match an existing sibling surface
   (mods panel, quest editor, progression canvas) rather than invent a new
   visual language.
4. **Run the anti-slop checklist** (§5 of design.md) before shipping.

## The checklist (from design.md §5)

- [ ] Every color is a token; no raw hexes inline in component CSS.
- [ ] No light-mode anywhere; no `#000000` pure black fills.
- [ ] No purple/neon gradients, no colored text glows unless sanctioned
      (selection / phase semantics — progression lanes are the one sanctioned
      multi-hue system).
- [ ] Radii ≤ 12px; panels at `--radius-md` (4px). No pill-everything.
- [ ] Type uses the app scale (13px base) and `--font-ui`/`--font-mono`.
- [ ] Spacing on the 4px grid (`--space-*`).
- [ ] Minecraft textures render pixelated (`image-rendering: pixelated`);
      UI chrome never competes with the assets it displays.
- [ ] Every interaction has hover / active / disabled / empty / loading
      states.
- [ ] No web-SaaS tropes: bento grids, magnetic buttons, glassmorphism,
      scroll choreography, hero sections, centered giant type.
- [ ] No generic AI slop: fake placeholder names/metrics, Acme-style naming,
      Unsplash links, default shadcn/Lucide styling, emoji as icons (use
      `frontend/src/components/ui/` SVG icons).

## Grading

Classify findings: **blocking** (violates the system — token bypass, light
mode, web-SaaS aesthetic, anti-slop violations) / **should** (inconsistent
with a sibling surface, missing interaction state) / **nit** (minor polish).
For every finding, state the design.md section it derives from — the system
is the authority, not the reviewer's taste.

## Teaching note (tutor sessions)

When reviewing with the student, teach the *principle* behind each rule so
they can judge new surfaces themselves: e.g. why dark-only (staring at quest
grids for hours), why small radii (tool, not consumer app), why pixelated
(assets must render faithfully). A student who can defend or deliberately
change each rule owns the design system.
