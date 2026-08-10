# design.md — ModCanvas Visual Design System

> **Purpose of this file:** the single source of truth for how ModCanvas *looks*
> and *feels*. Agents (and humans) working on any frontend surface must read
> this before proposing styles, and must be able to defend every visual
> decision against it. This file has been referenced since the first commit
> ("Based on design.md v1.0", `src/App.css:3`) but was never written — this is
> that promise, kept. If a visual decision is not grounded here, it either
> belongs here or it doesn't belong in the app.

## 1. Aesthetic Identity

ModCanvas is a **professional game-development tool** — the visual language of
Unity, Godot, and Blender editors, not a web SaaS or a marketing site.

- **Dark-only.** This is a deliberate decision (see §6). There is no light
  mode, and agents must never introduce one.
- **Tool-dense, not airy.** Dense information layouts with small text and tight
  spacing — this is a workbench users stare at for hours, not a landing page.
- **Calm, functional surfaces.** Neutrals carry the UI; color is reserved for
  *meaning* (status, phase, source badges, selection).
- **Sharp, not rounded.** Small radii (2–12px). This is not a consumer app.
- **The game is the content.** Minecraft textures render pixelated and
  faithfully; UI chrome must never compete with the assets it displays.

**What this app is NOT:** a web marketing site, a light-mode dashboard, a
brutalist/editorial experiment, or a "premium SaaS" bento-grid aesthetic. Do
not apply those conventions here.

## 2. Token System (Single Source of Truth)

All design values are CSS custom properties defined in **`frontend/src/App.css`
lines 8–136** (the `:root` block). **Never hardcode raw values** in component
CSS — use the tokens. If a token is missing, add it to the `:root` block (and
this doc), don't inline a value.

### 2.1 Surfaces (Backgrounds)

| Token | Value | Use |
|---|---|---|
| `--color-bg-base` | `#1B1B1F` | app shell, deepest background |
| `--color-bg-sunken` | `#18181C` | sunken wells (code, canvases) |
| `--color-bg-surface-0` | `#1F1F24` | base panel |
| `--color-bg-surface-1` | `#252529` | raised card |
| `--color-bg-surface-2` | `#2C2C31` | chip / nested surface |
| `--color-bg-surface-3` | `#333338` | hover / pop surface |

Surfaces step *upward* with elevation: `base → 0 → 1 → 2 → 3`. A raised card
on the app shell uses surface-1; a chip inside it uses surface-2. Use the
minimum elevation that communicates hierarchy.

### 2.2 Text

| Token | Value | Use |
|---|---|---|
| `--color-text-primary` | `#D4D4D8` | primary labels |
| `--color-text-secondary` | `#A1A1AA` | supporting text |
| `--color-text-tertiary` | `#71717A` | captions, de-emphasis |
| `--color-text-inverse` | `#FFFFFF` | on colored fills |

### 2.3 Borders

| Token | Value | Use |
|---|---|---|
| `--color-border-subtle` | `#27272A` | dividers between siblings |
| `--color-border-default` | `#3F3F46` | standard panel borders |
| `--color-border-strong` | `#52525B` | hover, emphasis |

### 2.4 Accent & Semantics

- **Accent: cool blue `#5B9BD5`** (`--color-accent`). This is the *single*
  accent color. It is deliberately desaturated and cool — **never purple, never
  neon.** (See the anti-patterns, §6.)
- Semantic colors: `--color-success` `#34D399`, `--color-warning` `#FBBF24`,
  `--color-error` `#F87171`, `--color-info` `#60A5FA`. Each has a `-subtle`
  variant (10% alpha) for tinted backgrounds.
- **Progression node type colors** live in
  `frontend/src/core/progression/phase-bands.ts` (`NODE_TYPE_COLORS`,
  `PHASE_COLORS`) — they are the *only* place multi-hue color is sanctioned,
  and they exist to distinguish progression phases. The progression lane
  palette is blue/green/violet/amber/rose.

### 2.5 Typography

| Token | Value | Use |
|---|---|---|
| `--font-ui` | Inter (fallback system stack) | all UI text |
| `--font-mono` | JetBrains Mono | code, script previews, numeric data |
| `--text-xs` | 11px | captions, badges |
| `--text-sm` | 12px | default secondary |
| `--text-base` | 13px | **base body size** (dense tool sizing) |
| `--text-md` | 14px | emphasized |
| `--text-lg` | 16px | section headers |
| `--text-xl` | 18px | panel headers |
| `--text-2xl` | 22px | large headers |

Font sizes are small by web standards *on purpose* — this is a dense desktop
workbench. Do not "fix" the type scale to web defaults.

### 2.6 Spacing

4px base grid: `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px, `-5` 20px,
`-6` 24px, `-8` 32px, `-10` 40px, `-12` 48px (+ `--space-half` 2px,
`--space-1-5` 6px). Use grid multiples; never arbitrary pixel values.

### 2.7 Radii, Shadows, Transitions

- Radii: `--radius-sm` 2px, `-md` 4px, `-lg` 8px, `-xl` 12px, `-full` pill.
  Default panels are `--radius-md` (4px). **Do not use large radii** — this is
  a tool, not a consumer app.
- Shadows are subtle and dark-tuned (dropdown/tooltip/modal tiers). No
  colored glows by default.
- Transitions: `--transition-fast` 120ms, `-normal` 200ms, `-slow` 300ms.

## 3. The FTB Quests Layer (second palette, aliased)

The quest editor historically had its own FTB-themed palette (gold/brown
parchment). **That was removed** — the parchment accents are gone and the FTB
layer now *aliases the app tokens* (`frontend/src/components/quest/
editor-theme.css`): `--ftb-accent: var(--color-accent)`, `--ftb-surface:
var(--color-bg-surface-1)`, etc.

Legacy `--ftb-*` literal values still exist in `App.css:109–120` for
back-compat but are **not** the live theme. When styling quest surfaces,
consume the `--ftb-*` *aliases* (they resolve to app tokens) or the app tokens
directly — never the legacy literals. One token source, one palette.

## 4. Component Conventions

### 4.1 Buttons

- **Primary**: accent background, white text, `--radius-sm`/`-md`. Reserved for
  the single most important action per surface.
- **Secondary**: surface-2 background, default border.
- **Danger**: `--color-error` (for destructive actions).
- **Icon button**: glyph-only, `--color-text-secondary` resting state.
- Every button needs hover + `:active` (pressed) + disabled states.

### 4.2 Forms

- Label above input; error text below input (inline, `--color-error`).
- Inputs: `--color-bg-sunken` fill, `--color-border-default` border, focus =
  accent border/ring.

### 4.3 Modals / Dialogs

- `--color-bg-overlay` (50% black) scrim; panel at `--color-bg-surface-1`,
  `--shadow-modal`. Header with title + close; footer with actions.

### 4.4 Canvas (quest editor + progression)

- Canvases sit on `--color-bg-sunken` with a subtle dot grid
  (React Flow `<Background>` / `.react-flow` rule in `ProgressionGraph.css`).
- Nodes are compact cards: surface gradient, 1px border, thin accent left
  border per type, `--radius-md`. Selected = accent border + glow; hover =
  lift + accent-tinted glow.
- **Textures render pixelated** (`image-rendering: pixelated`) — Minecraft
  assets must not be smoothed. Hero textures get a soft drop-shadow, never a
  hard box.
- Edges: 1.5px stroke tinted by source node type; hover/selected thicken.
  Optional edges animate (dash flow).
- Phase lanes (progression): gradient-tinted columns behind nodes, derived
  data only — never persisted, never selectable.

### 4.5 Empty states

Every panel needs a composed empty state: icon + title + explanation + the
action(s) to populate it. Never a bare "No data".

### 4.6 Status & badges

- Status dots, connection pill: five-state green→grey design (see
  `docs/history.md`, commit `dbc45bc`).
- Source badges: Modrinth `#00AF5C`, CurseForge `#F16436` (white text).
- Progress/loading: skeletal or themed spinners, never generic circular
  bootstraps.

## 5. What "Good" Looks Like (the anti-slop checklist)

Before shipping any frontend change, verify against the system:

- [ ] Every color is a token; no raw hexes inline in component CSS.
- [ ] No light-mode anywhere; no `#000000` pure black (use `#18181C`+).
- [ ] No purple/neon gradients, no colored text glows unless sanctioned
      (selection/phase semantics).
- [ ] Radii ≤ 12px; panels at 4px. No pill-everything.
- [ ] Type uses the app scale (13px base), `--font-ui`/`--font-mono`.
- [ ] Spacing on the 4px grid.
- [ ] Textures pixelated; UI chrome never competes with assets.
- [ ] Every interaction has hover/active/disabled/empty/loading states.
- [ ] No web-SaaS tropes: bento grids, magnetic buttons, glassmorphism,
      scroll-choreography, hero sections. None of these belong in a desktop
      workbench.
- [ ] The change matches a *sibling* surface (e.g. new panel matches the mods
      panel, not a new invention).

## 6. Anti-patterns (do NOT do these)

- **Light mode.** The app is dark-only by decision. No `@media (prefers-color-scheme)`.
- **The AI-purple aesthetic.** No purple button glows, neon gradients, or
  purple-blue default accents. Accent is `#5B9BD5`.
- **Web marketing aesthetics.** Centered heroes, giant display type,
  max-width prose containers, sticky scroll effects, bento grids.
- **Generic AI slop.** "Jane Doe" placeholder names, `99.99%` fake metrics,
  Acme/Startup-slop naming, Unsplash links, default shadcn/Lucide styling.
  Use real, specific content or honest placeholders.
- **Large radii and floating shadows.** This is a dense tool; elevation is
  communicated by surface steps, not big rounded cards.
- **Emoji as icons.** Use the SVG icon set (`frontend/src/components/ui/`).
- **Overriding the token system.** If a value isn't in the system, extend the
  system — don't bypass it.

## 7. How to Use This File

1. **Agents:** read this before any frontend work. When proposing styles,
   name the tokens you're using. When reviewing, check against §5.
2. **When adding a token:** add it to `App.css` `:root` AND this file's
   glossary in the same pass (AGENTS.md doc-sync rule).
3. **When changing the aesthetic:** this file changes first, then the code.
   A visual change without a design.md change is a doc-sync violation.

---

*Related: `frontend/src/App.css` (token definitions), `frontend/src/components/
quest/editor-theme.css` (FTB aliasing), `frontend/src/core/progression/
phase-bands.ts` (progression palette), `docs/tutor-agent.md` (agent design
review flow).*
