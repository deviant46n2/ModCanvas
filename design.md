# Modpack Engine — Design System

> **Version:** 1.0
> **Last Updated:** 2026-08-06
> **Status:** Active Reference

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Spacing & Layout System](#4-spacing--layout-system)
5. [Component Patterns](#5-component-patterns)
6. [Iconography](#6-iconography)
7. [Interaction Patterns](#7-interaction-patterns)
8. [Dark Mode Elevation System](#8-dark-mode-elevation-system)
9. [Cross-Platform Considerations](#9-cross-platform-considerations)
10. [Game Dev Software Reference](#10-game-dev-software-reference)
11. [CSS Custom Properties](#11-css-custom-properties)
12. [Component Status Map](#12-component-status-map)

---

## 1. Design Philosophy

### The Goal

Modpack Engine should look and feel like professional game development software — Unity's dark theme, Unreal Engine's content browser, Blender's property panels. Not a web app pretending to be a desktop app. Not a generic dark theme. A **purpose-built creative tool** that happens to be dark-themed because professionals stare at these screens for hours.

### Core Principles

1. **Density with clarity.** Show information efficiently without clutter. Every pixel earns its place.
2. **Hierarchy through contrast.** The most important element on screen should be visually dominant. Use color, size, and weight — not decoration.
3. **Consistent surface language.** Elevation = importance. Higher surfaces are brighter. The eye goes where the light is.
4. **Feedback always.** Every hover, click, selection, and state change has a visible response. No silent failures.
5. **Restraint over decoration.** No gradients, no drop shadows on everything, no visual noise. Clean, flat, professional.
6. **Dark-only. No light mode.** ModCanvas is dark-only by design — there is no light theme and no per-screen exception. A white or near-white background anywhere in the app is a **bug, not a mode**: it means a component shipped unstyled (default browser button/input/select surface). Every component must be styled with the token system before merge; an unstyled control is a review-blocking defect.

### What We Are NOT

- ❌ Cyberpunk neon aesthetic
- ❌ Terminal/hacker green-on-black
- ❌ Generic Bootstrap dark mode
- ❌ Material Design with dark colors slapped on
- ❌ macOS translucent vibrancy effects
- ❌ Information overload dashboards

### What We ARE

- ✅ Professional dark creative tool (Unity, Blender, Figma class)
- ✅ Clean typography with clear hierarchy
- ✅ Subtle borders for panel separation (not shadows everywhere)
- ✅ Muted color palette with purposeful accent color
- ✅ Generous whitespace within dense layouts
- ✅ Smooth, subtle transitions (100-200ms)
- ✅ Keyboard-navigable, accessible

---

## 2. Color Palette

### Design Principles for Color

- **Blue-gray base.** Not pure black (#000) or pure gray. Blue-gray feels like a professional IDE, not a phone app.
- **One accent color.** Blue (#5B9BD5) is the only color that demands attention. Everything else is neutral.
- **Semantic colors are rare-use.** Green, red, yellow only for status/feedback. Never for decoration.
- **White text is rare.** Primary text is off-white (#D4D4D8). Pure white (#FFF) is reserved for the absolute highest emphasis.

### 2.1 Background & Surface Colors

These define the elevation system. Each level is subtly brighter.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg-base` | `#1B1B1F` | Deepest background. App shell, body. |
| `--color-bg-sunken` | `#18181C` | Sunken panels, input fields, code blocks. |
| `--color-bg-surface-0` | `#1F1F24` | Default surface. Cards, list items, sidebar. |
| `--color-bg-surface-1` | `#252529` | Raised surface. Hover states, secondary panels. |
| `--color-bg-surface-2` | `#2C2C31` | Elevated surface. Dropdowns, popovers, tooltips. |
| `--color-bg-surface-3` | `#333338` | Highest surface. Modals, dialogs. |
| `--color-bg-overlay` | `rgba(0, 0, 0, 0.5)` | Modal backdrop. |

**Why blue-gray?** Pure neutral grays feel cold and clinical. Blue-gray (#1B1B1F has a subtle blue undertone) feels warm and professional — like Unity, Unreal, and Blender all converged on.

### 2.2 Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-text-primary` | `#D4D4D8` | Main body text, labels, headings. |
| `--color-text-secondary` | `#A1A1AA` | Metadata, descriptions, secondary info. |
| `--color-text-tertiary` | `#71717A` | Placeholder text, disabled labels, timestamps. |
| `--color-text-inverse` | `#FFFFFF` | Text on accent-colored backgrounds. |
| `--color-text-on-accent` | `#FFFFFF` | Specifically for text on primary buttons. |

**Why not pure white for primary text?** `#D4D4D8` (zinc-200) reduces eye strain during long sessions. Pure white on near-black creates excessive contrast that fatigues the eyes. This is why Unity, VS Code, and every professional IDE use off-white text.

### 2.3 Border Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-border-subtle` | `#27272A` | Panel separators, subtle divisions. |
| `--color-border-default` | `#3F3F46` | Input borders, card borders, dividers. |
| `--color-border-strong` | `#52525B` | Emphasized borders, focused inputs. |
| `--color-border-accent` | `#5B9BD5` | Focused inputs, active selections. |

### 2.4 Accent Color (Blue — Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-accent-subtle` | `rgba(91, 155, 213, 0.10)` | Accent backgrounds (hover hints, selected row tint). |
| `--color-accent-muted` | `rgba(91, 155, 213, 0.20)` | Toggle backgrounds, badge fills. |
| `--color-accent` | `#5B9BD5` | Primary actions, links, active tabs, focus rings. |
| `--color-accent-hover` | `#4A8AC4` | Hover state for accent elements. |
| `--color-accent-strong` | `#3D7AB4` | Pressed/active state for accent elements. |

**Why `#5B9BD5`?** This is a muted, professional blue — not the garish `#3B82F6` Tailwind blue. It reads as "serious tool" not "SaaS marketing site." It has enough contrast against dark backgrounds to meet WCAG AA for large text, and works well for focus indicators.

### 2.5 Semantic / Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-success` | `#34D399` | Running status, enabled toggle, success message. |
| `--color-success-subtle` | `rgba(52, 211, 153, 0.10)` | Success background tint. |
| `--color-warning` | `#FBBF24` | Warning status, install in progress. |
| `--color-warning-subtle` | `rgba(251, 191, 36, 0.10)` | Warning background tint. |
| `--color-error` | `#F87171` | Error status, delete actions, crash indicators. |
| `--color-error-subtle` | `rgba(248, 113, 113, 0.10)` | Error background tint. |
| `--color-info` | `#60A5FA` | Informational messages, tips. |
| `--color-info-subtle` | `rgba(96, 165, 250, 0.10)` | Info background tint. |

**Usage rules:**
- Semantic colors are for **status and feedback only**, never for decoration.
- Never use semantic colors as button backgrounds except for destructive confirmations.
- Status indicators (dots, badges) can use semantic colors at full opacity.
- Background tints should always be at 10% opacity to avoid visual noise.

### 2.6 Special Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-disabled-bg` | `#27272A` | Disabled button/input background. |
| `--color-disabled-text` | `#52525B` | Disabled text. |
| `--color-scrollbar` | `#3F3F46` | Scrollbar thumb. |
| `--color-scrollbar-hover` | `#52525B` | Scrollbar thumb hover. |
| `--color-code-bg` | `#18181C` | Inline code, log output background. |

---

## 3. Typography

### 3.1 Font Stack

```css
/* Primary UI Font — System font stack for native feel */
--font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;

/* Monospace Font — For code, logs, file paths, version strings */
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
```

**Why Inter?**
- Designed specifically for computer screens at small sizes
- Excellent legibility at 11-14px (where most UI text lives)
- Tabular numbers by default (version strings, counts align perfectly)
- Open-source, free for commercial use
- Used by: Figma, Vercel, many professional tools
- Falls back to Segoe UI (Windows), system-ui (macOS/Linux) gracefully

**Install via Google Fonts or bundle locally.** For a Tauri app, bundling is recommended to avoid network dependency.

### 3.2 Type Scale

All sizes in pixels. Line heights are unitless multipliers.

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `--text-xs` | `11px` | `1.4` | `400` | Timestamps, metadata, badges, status labels. |
| `--text-sm` | `12px` | `1.45` | `400` | Secondary text, descriptions, helper text. |
| `--text-base` | `13px` | `1.5` | `400` | Body text, list items, form labels. |
| `--text-md` | `14px` | `1.5` | `400` | Primary content, input text, button text. |
| `--text-lg` | `16px` | `1.4` | `500` | Section headers, card titles. |
| `--text-xl` | `18px` | `1.35` | `600` | Panel titles, modal headings. |
| `--text-2xl` | `22px` | `1.3` | `600` | Page titles (rare, welcome screen only). |

**Why 13px as base?** Professional desktop apps (Unity, VS Code, Figma) use 12-13px as their base. It provides density without cramping. 14px (web standard) is too large for information-dense desktop UIs.

### 3.3 Font Weights

| Weight | CSS Value | Usage |
|--------|-----------|-------|
| Regular | `400` | Body text, labels, descriptions. |
| Medium | `500` | Buttons, active items, emphasis. |
| Semibold | `600` | Section headers, card titles, navigation. |
| Bold | `700` | Rare. Only for very high-emphasis UI text. |

**Never use bold for body text.** Bold is for structural hierarchy, not emphasis within paragraphs.

### 3.4 Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-tight` | `-0.01em` | Headings at 18px+. Slightly tighter for visual weight. |
| `--tracking-normal` | `0` | Body text. Default. |
| `--tracking-wide` | `0.04em` | Uppercase labels, section headers (e.g., "PROJECTS"). |
| `--tracking-wider` | `0.08em` | All-caps badges, status indicators. |

### 3.5 Text Rendering

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

This is critical for dark themes. Without antialiasing, light text on dark backgrounds looks jagged and blurry on macOS.

---

## 4. Spacing & Layout System

### 4.1 Spacing Scale

Built on a 4px base unit. Every spacing value is a multiple of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | `0` | Reset. |
| `--space-0.5` | `2px` | Tight gaps (icon + text inline). |
| `--space-1` | `4px` | Minimal gaps, padding within small elements. |
| `--space-1.5` | `6px` | Small gaps between related items. |
| `--space-2` | `8px` | Standard gap between compact items. |
| `--space-3` | `12px` | Default gap between list items, card padding. |
| `--space-4` | `16px` | Standard padding, section gaps. |
| `--space-5` | `20px` | Panel padding, moderate spacing. |
| `--space-6` | `24px` | Large panel padding, section separation. |
| `--space-8` | `32px` | Major section breaks. |
| `--space-10` | `40px` | Page-level spacing. |
| `--space-12` | `48px` | Maximum spacing (rare). |

### 4.2 Layout Grid

```
┌──────────┬──────────────────────────────────┬─────────────────────┐
│          │                                  │                     │
│ Sidebar  │         Main Content             │    Inspector        │
│  280px   │          flex: 1                 │    (future)         │
│          │                                  │    320px            │
│          │                                  │                     │
└──────────┴──────────────────────────────────┴─────────────────────┘
│                     Status Bar (28px)                              │
└───────────────────────────────────────────────────────────────────┘
```

**Current layout:** Sidebar (280px) + Main content (flex: 1).
**Future layout:** Sidebar (280px) + Main content (flex: 1) + Inspector (320px, collapsible).

### 4.3 Sidebar

| Property | Value |
|----------|-------|
| Width | `280px` (fixed, not resizable in MVP) |
| Min width | `240px` |
| Max width | `400px` (if made resizable later) |
| Background | `--color-bg-surface-0` |
| Border right | `1px solid --color-border-subtle` |
| Section divider | `1px solid --color-border-subtle` with `--space-3` padding |

### 4.4 Main Content Area

| Property | Value |
|----------|-------|
| Background | `--color-bg-base` |
| Padding | `--space-5` (20px) for content areas |
| Tab bar padding | `0 --space-5` |
| Header padding | `--space-5` (20px) |
| Content scroll | Custom scrollbar, 8px wide |

### 4.5 Panel Architecture

Every major UI area is a "panel" with consistent structure:

```
┌─────────────────────────────────────┐
│  Panel Header (h: 40px)             │  ← Background: surface-1
│  Title + actions                    │
├─────────────────────────────────────┤
│                                     │
│  Panel Content                      │  ← Background: base or surface-0
│  (scrollable)                       │
│                                     │
└─────────────────────────────────────┘
```

**Panel header heights:**
- Compact: `32px` — Toolbar-style, icon-only actions
- Default: `40px` — Standard panel headers
- Spacious: `48px` — Workspace headers with title + metadata

---

## 5. Component Patterns

### 5.1 Buttons

#### Primary Button

Used for the main action in any context (Create, Save, Launch, Import).

```css
.btn-primary {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease;
}
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-primary:active { background: var(--color-accent-strong); }
.btn-primary:disabled {
  background: var(--color-disabled-bg);
  color: var(--color-disabled-text);
  cursor: not-allowed;
}
```

#### Secondary Button

Used for less prominent actions (Cancel, Browse, Remove).

```css
.btn-secondary {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}
.btn-secondary:hover {
  background: var(--color-bg-surface-1);
  color: var(--color-text-primary);
  border-color: var(--color-border-strong);
}
.btn-secondary:active { background: var(--color-bg-surface-2); }
```

#### Ghost Button

Used in toolbars, headers, and compact areas.

```css
.btn-ghost {
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.12s ease;
}
.btn-ghost:hover {
  background: var(--color-bg-surface-1);
  color: var(--color-text-primary);
}
```

#### Danger Button

Used for destructive actions (Delete Project, Remove Instance). **Always requires confirmation.**

```css
.btn-danger {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: var(--color-error);
  color: #FFFFFF;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease;
}
.btn-danger:hover { background: #EF4444; }
.btn-danger:active { background: #DC2626; }
```

#### Icon Button

Used in toolbars, sidebar headers, inline actions.

```css
.btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
}
.btn-icon:hover {
  background: var(--color-bg-surface-1);
  color: var(--color-text-primary);
}
```

#### Button Sizes

| Size | Height | Padding | Font Size | Usage |
|------|--------|---------|-----------|-------|
| `xs` | `22px` | `0 6px` | `11px` | Inline actions, tight spaces. |
| `sm` | `26px` | `0 10px` | `12px` | Secondary actions in panels. |
| `md` | `32px` | `0 16px` | `13px` | Standard buttons (default). |
| `lg` | `36px` | `0 20px` | `14px` | Primary actions, CTAs. |

### 5.2 Input Fields

```css
.input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: var(--color-bg-sunken);
  color: var(--color-text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  transition: border-color 0.12s ease;
}
.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}
.input::placeholder { color: var(--color-text-tertiary); }
.input:disabled {
  background: var(--color-disabled-bg);
  color: var(--color-disabled-text);
  cursor: not-allowed;
}
```

**Key details:**
- `background: var(--color-bg-sunken)` — Inputs look recessed, not flush. This is the Unity/VS Code pattern.
- Focus ring uses box-shadow, not outline. Provides consistent rendering across platforms.
- 1px border, not 2px. Subtle is professional.

#### Textarea

```css
.textarea {
  min-height: 80px;
  padding: 8px 10px;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: var(--color-bg-sunken);
  color: var(--color-text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
/* Same focus states as .input */
```

#### Select / Dropdown

```css
.select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: var(--color-bg-sunken);
  color: var(--color-text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  appearance: none;
  background-image: url("data:image/svg+xml,..."); /* Chevron icon */
  background-repeat: no-repeat;
  background-position: right 8px center;
  cursor: pointer;
}
```

### 5.3 Toggle / Switch

Used for enable/disable states (mod toggles).

```css
.toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease;
}
.toggle.off {
  background: var(--color-bg-surface-2);
}
.toggle.on {
  background: var(--color-accent);
}
.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FFFFFF;
  transition: transform 0.15s ease;
}
.toggle.on::after {
  transform: translateX(16px);
}
```

### 5.4 Cards / List Items

#### Project Item (Sidebar)

```css
.project-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.project-item:hover {
  background: var(--color-bg-surface-1);
}
.project-item.active {
  background: var(--color-accent-subtle);
  border-left: 2px solid var(--color-accent);
  padding-left: 10px; /* Compensate for border */
}
```

**Active state pattern:** Accent-tinted background + 2px left border accent. This is the Unity Project panel pattern. It's distinctive, accessible (doesn't rely on color alone), and looks professional.

#### Instance Item (Sidebar)

Same pattern as project items, with additional status indicator:

```css
.instance-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.instance-item:hover {
  background: var(--color-bg-surface-1);
}
.instance-item.active {
  background: var(--color-accent-subtle);
  border-left: 2px solid var(--color-accent);
  padding-left: 10px;
}
```

**Status indicator dot:**

```css
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
.status-dot.running { background: var(--color-success); }
.status-dot.stopped { background: var(--color-text-tertiary); }
.status-dot.installing { background: var(--color-warning); }
.status-dot.crashed { background: var(--color-error); }
```

#### Mod Card (Content Area)

```css
.mod-card {
  padding: 12px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  background: var(--color-bg-surface-0);
  transition: border-color 0.12s ease;
}
.mod-card:hover {
  border-color: var(--color-border-default);
}
.mod-card.disabled {
  opacity: 0.5;
}
```

### 5.5 Tabs

Unity-style bottom-bordered tabs.

```css
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg-surface-0);
  padding: 0 16px;
}

.tab {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
  margin-bottom: -1px; /* Overlap with border-bottom of parent */
}
.tab:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-surface-1);
}
.tab.active {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-accent);
}
```

### 5.6 Modals / Dialogs

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.15s ease;
}

.modal {
  background: var(--color-bg-surface-3);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.2s ease;
}

.modal-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 20px;
}
```

**Key details:**
- Modal background is the highest surface level (`surface-3`).
- Shadow is stronger than regular panels — modals float above everything.
- Width is 420px (not 400px). Slightly wider for comfortable form layouts.
- Entry animation: fade overlay + slide up modal (150-200ms).

### 5.7 Form Groups

```css
.form-group {
  margin-bottom: 16px;
}
.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.form-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}
```

### 5.8 Tooltips

```css
.tooltip {
  position: absolute;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--color-bg-surface-3);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 200;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

### 5.9 Badges / Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.badge-default {
  background: var(--color-bg-surface-2);
  color: var(--color-text-secondary);
}
.badge-accent {
  background: var(--color-accent-muted);
  color: var(--color-accent);
}
.badge-success {
  background: var(--color-success-subtle);
  color: var(--color-success);
}
.badge-warning {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}
.badge-error {
  background: var(--color-error-subtle);
  color: var(--color-error);
}
```

### 5.10 Progress Bar

```css
.progress-track {
  height: 4px;
  border-radius: 2px;
  background: var(--color-bg-surface-2);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}
```

**Height: 4px.** Not 6px, not 8px. Thin progress bars look professional. Thick ones look like a loading screen.

### 5.11 Log Output / Code Blocks

```css
.log-output {
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
```

### 5.12 Search Bar

```css
.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
}
.search-input-wrapper .icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  pointer-events: none;
}
.search-input {
  height: 36px;
  padding: 0 12px 0 34px; /* Space for search icon */
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: var(--color-bg-sunken);
  color: var(--color-text-primary);
  font-size: 13px;
  width: 100%;
}
```

### 5.13 Section Headers

Used in sidebar and content panels.

```css
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-tertiary);
}
```

**Uppercase section headers** are a Unity/Unreal convention. They create clear structural hierarchy in dense UIs.

### 5.14 Empty States

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}
.empty-state-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  color: var(--color-text-tertiary);
  opacity: 0.5;
}
.empty-state-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.empty-state-description {
  font-size: 13px;
  color: var(--color-text-tertiary);
  max-width: 300px;
}
```

### 5.15 Breadcrumbs

Future use for project navigation depth.

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.breadcrumb-item {
  color: var(--color-text-secondary);
  cursor: pointer;
}
.breadcrumb-item:hover { color: var(--color-text-primary); }
.breadcrumb-separator {
  color: var(--color-text-tertiary);
}
.breadcrumb-item.current {
  color: var(--color-text-primary);
  cursor: default;
}
```

---

## 6. Iconography

### 6.1 Icon Library

**Recommended: [Lucide React](https://lucide.dev/)**

Why Lucide:
- Clean, consistent line icons at 24x24 grid
- MIT licensed
- Tree-shakeable React components
- Consistent 1.5px stroke weight
- Large library (1000+ icons) covering all UI needs
- Used by many professional tools (Supabase, Railway, etc.)

**Alternative:** [Phosphor Icons](https://phosphoricons.com/) — slightly heavier weight, more playful. Good if you want a friendlier feel.

**Do NOT use:** Font Awesome (heavy), Material Icons (too Google-y), custom SVGs (inconsistent).

### 6.2 Icon Sizes

| Size | Pixels | Usage |
|------|--------|-------|
| `xs` | `14px` | Inline text icons, badge icons. |
| `sm` | `16px` | Compact buttons, list item icons. |
| `md` | `20px` | Standard UI icons (default). |
| `lg` | `24px` | Sidebar icons, feature icons. |
| `xl` | `32px` | Empty state icons, hero icons. |

### 6.3 Icon + Text Alignment

```css
.icon-with-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.icon-with-text svg {
  flex-shrink: 0;
}
```

**Alignment rule:** Icons align to the text's cap height, not the vertical center. For most fonts at 13px, this means `translateY(-0.5px)` on the icon.

### 6.4 Icon Colors

- Default: `var(--color-text-secondary)` — Icons are secondary visual elements.
- Active/Selected: `var(--color-accent)` — Only when the icon represents an active state.
- Disabled: `var(--color-disabled-text)` — Low contrast.
- On accent bg: `#FFFFFF` — White icons on blue buttons.

---

## 7. Interaction Patterns

### 7.1 Hover States

**Principle:** Hover should indicate interactivity, not scream for attention.

| Element | Hover Effect |
|---------|-------------|
| Sidebar item | `background: var(--color-bg-surface-1)` |
| Button (primary) | `background: var(--color-accent-hover)` — 8% darker |
| Button (secondary) | `background: var(--color-bg-surface-1)` + border brightens |
| Button (ghost) | `background: var(--color-bg-surface-1)` |
| Card | `border-color: var(--color-border-default)` — border brightens |
| Link/text button | `color: var(--color-text-primary)` — brightens |
| Icon button | `background: var(--color-bg-surface-1)` + color brightens |
| Tab | `background: var(--color-bg-surface-1)` + color brightens |

**Transition speed:** `0.12s ease` for all hover transitions. Fast enough to feel responsive, slow enough to be perceptible.

### 7.2 Active / Pressed States

| Element | Active Effect |
|---------|-------------|
| Button (primary) | `background: var(--color-accent-strong)` — 15% darker |
| Button (secondary) | `background: var(--color-bg-surface-2)` |
| Sidebar item | `background: var(--color-bg-surface-2)` |

### 7.3 Focus States (Keyboard Navigation)

**Every interactive element must have a visible focus indicator.**

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
```

- Use `:focus-visible` (not `:focus`) to only show focus rings for keyboard users, not mouse clicks.
- 2px solid blue outline with 1px offset. Matches the accent color.
- Never use `outline: none` without providing an alternative focus indicator.

### 7.4 Selection States

**Sidebar items:**

```css
/* Selected item — the "active" pattern */
.item.active {
  background: var(--color-accent-subtle);
  border-left: 2px solid var(--color-accent);
  padding-left: 10px; /* Compensate for border */
}
```

**Content area selections (multi-select in future):**

```css
.item.selected {
  background: var(--color-accent-subtle);
  border: 1px solid var(--color-accent-muted);
}
```

### 7.5 Drag and Drop Feedback

Future use for quest/progression editors.

```css
.drag-over {
  border: 2px dashed var(--color-accent);
  background: var(--color-accent-subtle);
}
.dragging {
  opacity: 0.5;
}
.drop-preview {
  border-top: 2px solid var(--color-accent);
}
```

### 7.6 Loading States

**Spinner:**

```css
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-bg-surface-2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

**Skeleton loading (for future data-heavy panels):**

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-surface-1) 25%,
    var(--color-bg-surface-2) 50%,
    var(--color-bg-surface-1) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
```

**Inline loading text:**

Use "Loading..." with a spinner, or "Fetching..." with a progress indicator. Never show nothing.

### 7.7 Error States

**Inline error (form field):**

```css
.input.error {
  border-color: var(--color-error);
  box-shadow: 0 0 0 1px var(--color-error);
}
.form-error {
  font-size: 11px;
  color: var(--color-error);
  margin-top: 4px;
}
```

**Error banner (launch errors, import errors):**

```css
.error-banner {
  padding: 12px 16px;
  background: var(--color-error-subtle);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-error);
}
```

**Copy button rule:** All error displays (banners, inline errors, crash logs, compatibility issues) must include a copy button. Error messages are frequently shared in bug reports, Discord channels, and support threads. Make it effortless.

```tsx
<div className="error-banner">
  <div className="error-header">
    <strong>Error:</strong>
    <button className="btn-copy" onClick={() => navigator.clipboard.writeText(errorText)}>Copy</button>
  </div>
  <pre className="copyable">{errorText}</pre>
</div>
```

```css
.error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.btn-copy {
  padding: 2px 8px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.btn-copy:hover {
  background: var(--color-bg-surface-1);
  color: var(--color-text-primary);
}

.copyable {
  user-select: all;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
```

### 7.8 Disabled States

```css
:disabled,
.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none; /* For wrapper elements */
}
```

**Rule:** Disabled elements should look clearly non-interactive. 40% opacity achieves this without looking broken.

### 7.9 Transitions

| Property | Duration | Easing |
|----------|----------|--------|
| Background color | `120ms` | `ease` |
| Border color | `120ms` | `ease` |
| Text color | `120ms` | `ease` |
| Transform (scale) | `150ms` | `ease-out` |
| Modal entrance | `200ms` | `ease-out` |
| Progress bar width | `300ms` | `ease` |
| Panel expand/collapse | `200ms` | `ease-in-out` |

**Rule:** Transitions should be imperceptible in normal use but provide smooth visual feedback. If you notice the animation, it's too slow.

---

## 8. Dark Mode Elevation System

### 8.1 How Elevation Works in Dark Mode

In light mode, elevation = shadows (higher = bigger shadow). In dark mode, shadows are invisible against dark backgrounds. Instead, elevation = **brightness**.

**Higher surfaces are lighter.** This is how Unity, VS Code, and every professional dark theme works.

```
Level 0 (base):     #1B1B1F  ← Deepest, darkest
Level 1 (surface):  #1F1F24  ← Default panels
Level 2 (raised):   #252529  ← Hover states, secondary panels
Level 3 (elevated): #2C2C31  ← Dropdowns, popovers
Level 4 (floating): #333338  ← Modals, dialogs
```

**Each step is ~4-6% brighter.** Subtle enough to not be jarring, visible enough to create depth.

### 8.2 Shadow System (Minimal)

Dark mode shadows are used sparingly — only for floating elements that need to feel "detached" from the page.

| Element | Shadow |
|---------|--------|
| Sidebar | None (it's a structural element) |
| Panels | None (borders define edges) |
| Cards | None (borders define edges) |
| Dropdowns | `0 4px 12px rgba(0, 0, 0, 0.3)` |
| Tooltips | `0 2px 8px rgba(0, 0, 0, 0.3)` |
| Modals | `0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2)` |

**Rule:** If an element is part of the page layout, no shadow. If it floats above the page, use a shadow.

### 8.3 Border as Separator

In dark mode, **borders are the primary tool for separating surfaces.** Not shadows.

```css
/* Panel separation */
border: 1px solid var(--color-border-subtle);

/* Content separation within a panel */
border-bottom: 1px solid var(--color-border-subtle);

/* Card boundaries */
border: 1px solid var(--color-border-subtle);
```

**Border color rules:**
- `--color-border-subtle` (#27272A) for most separations. Barely visible, just enough to define edges.
- `--color-border-default` (#3F3F46) for interactive elements (inputs, cards on hover).
- `--color-border-strong` (#52525B) for emphasis (focused inputs).

---

## 9. Cross-Platform Considerations

### 9.1 Window Chrome

**Tauri approach:** Use `decorations: true` (native title bar) for MVP. Custom title bars add complexity and platform-specific bugs.

**Title bar height:**
- Windows: 32px (standard)
- macOS: 28px (standard, with traffic lights)
- Linux: Varies by DE (typically 28-36px)

**If building a custom title bar later:**
- Always include window controls (minimize, maximize, close)
- Traffic light area on macOS needs special handling
- Use `-webkit-app-region: drag` for the title bar area
- Buttons inside title bar: `-webkit-app-region: no-drag`

### 9.2 Font Rendering

Different platforms render fonts differently:

```css
/* Consistent rendering */
body {
  -webkit-font-smoothing: antialiased;    /* macOS Chrome/Safari */
  -moz-osx-font-smoothing: grayscale;     /* macOS Firefox */
  text-rendering: optimizeLegibility;      /* Better hinting */
  font-feature-settings: 'tnum' 1;        /* Tabular numbers */
}
```

**Platform notes:**
- **Windows:** ClearType renders fonts slightly heavier. The Inter font accounts for this.
- **macOS:** Retina displays render fonts beautifully. Font smoothing settings affect appearance.
- **Linux:** Font rendering depends on the DE and fontconfig. Inter handles this well.

### 9.3 Touch Targets

While this is a desktop app, some users use touchscreens (Surface, iPad with keyboard):

- Minimum touch target: `32px × 32px`
- Minimum spacing between touch targets: `8px`
- All buttons already meet this requirement at `height: 32px`

### 9.4 Scrollbar Styling

```css
/* Webkit (Chrome, Safari, Edge) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-scrollbar) transparent;
}
```

### 9.5 Platform-Specific Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Copy | `Ctrl+C` | `⌘+C` |
| Paste | `Ctrl+V` | `⌘+V` |
| Undo | `Ctrl+Z` | `⌘+Z` |
| Save | `Ctrl+S` | `⌘+S` |
| Find | `Ctrl+F` | `⌘+F` |
| Close Tab | `Ctrl+W` | `⌘+W` |
| Preferences | `Ctrl+,` | `⌘+,` |

**Implementation:** Check `navigator.platform` or Tauri's platform API to display the correct modifier key.

---

## 10. Game Dev Software Reference

### 10.1 Unity Editor (Primary Reference)

**What to borrow:**

- **Panel borders:** 1px `#333` borders between panels. Clean, minimal.
- **Inspector panel:** Right-aligned property panels with labels on the left, controls on the right.
- **Hierarchy panel:** Tree views with indentation, disclosure triangles, and alternating row backgrounds.
- **Active state:** Blue highlight background + subtle left border accent.
- **Tab style:** Bottom-border active indicator, not filled tabs.
- **Section headers:** Uppercase, small text, muted color. Creates clear structure.
- **Color scheme:** Dark gray (#222-#333) backgrounds, slightly lighter (#383838) for panels, light gray (#CCC-#FFF) text.

**Specific hex values from Unity 2023 dark theme (for reference):**
- Background: `#2D2D2D`
- Panel: `#383838`
- Header: `#2A2A2A`
- Text: `#C8C8C8`
- Accent: `#2A7DE1`
- Border: `#1A1A1A`

**Our adaptation:** We use a blue-gray palette instead of Unity's neutral gray. This is intentional — our blue-gray feels more modern and cohesive.

### 10.2 Unreal Engine (Secondary Reference)

**What to borrow:**

- **Content browser:** Grid/list view toggle for browsing assets (future: mod grid view).
- **Detail panel:** Expandable/collapsible property sections.
- **Toolbar style:** Compact icon buttons in a toolbar strip.
- **Tab Docking:** Panels can be rearranged (future feature).

### 10.3 Blender

**What to borrow:**

- **Node editor:** For the future progression/quest graph editor.
- **Properties panel:** Collapsible sections with icons.
- **Outliner:** Hierarchical tree with visibility toggles (eye icons).

### 10.4 Figma

**What to borrow:**

- **Left panel (Layers):** Clean list items with icons and selection states.
- **Right panel (Design):** Property inspector with grouped controls.
- **Clean canvas:** The main editing area has no visual noise.
- **Component library panel:** Future for pack templates.

### 10.5 Summary: Key Visual Cues to Replicate

| Cue | Source | Implementation |
|-----|--------|---------------|
| Active sidebar item = blue tint + left border | Unity | `.active { background: accent-subtle; border-left: 2px solid accent; }` |
| Uppercase section headers | Unity, Unreal | `text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em;` |
| 1px panel borders (not shadows) | Unity, Blender | `border: 1px solid var(--color-border-subtle);` |
| Sunken input fields | VS Code, Unity | `background: var(--color-bg-sunken);` |
| Tab = bottom border indicator | Unity, Figma | `border-bottom: 2px solid accent;` |
| Density with readability | All pro tools | 13px base, 32px buttons, 4px grid |
| Monospace for technical data | Unity console, VS Code | `font-family: var(--font-mono);` |
| Status indicators as colored dots | Unity, Unreal | Small colored circles, not text badges |

---

## 11. CSS Custom Properties

### Complete Token Set

Copy this entire block to replace the existing `:root` variables. This is the single source of truth.

```css
:root {
  /* ===== BACKGROUND & SURFACE ===== */
  --color-bg-base:             #1B1B1F;
  --color-bg-sunken:           #18181C;
  --color-bg-surface-0:        #1F1F24;
  --color-bg-surface-1:        #252529;
  --color-bg-surface-2:        #2C2C31;
  --color-bg-surface-3:        #333338;
  --color-bg-overlay:          rgba(0, 0, 0, 0.50);

  /* ===== TEXT ===== */
  --color-text-primary:        #D4D4D8;
  --color-text-secondary:      #A1A1AA;
  --color-text-tertiary:       #71717A;
  --color-text-inverse:        #FFFFFF;
  --color-text-on-accent:      #FFFFFF;

  /* ===== BORDERS ===== */
  --color-border-subtle:       #27272A;
  --color-border-default:      #3F3F46;
  --color-border-strong:       #52525B;
  --color-border-accent:       #5B9BD5;

  /* ===== ACCENT (Blue) ===== */
  --color-accent-subtle:       rgba(91, 155, 213, 0.10);
  --color-accent-muted:        rgba(91, 155, 213, 0.20);
  --color-accent:              #5B9BD5;
  --color-accent-hover:        #4A8AC4;
  --color-accent-strong:       #3D7AB4;

  /* ===== SEMANTIC ===== */
  --color-success:             #34D399;
  --color-success-subtle:      rgba(52, 211, 153, 0.10);
  --color-warning:             #FBBF24;
  --color-warning-subtle:      rgba(251, 191, 36, 0.10);
  --color-error:               #F87171;
  --color-error-subtle:        rgba(248, 113, 113, 0.10);
  --color-info:                #60A5FA;
  --color-info-subtle:         rgba(96, 165, 250, 0.10);

  /* ===== SPECIAL ===== */
  --color-disabled-bg:         #27272A;
  --color-disabled-text:       #52525B;
  --color-scrollbar:           #3F3F46;
  --color-scrollbar-hover:     #52525B;
  --color-code-bg:             #18181C;

  /* ===== TYPOGRAPHY ===== */
  --font-ui:   'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;

  --text-xs:   11px;
  --text-sm:   12px;
  --text-base: 13px;
  --text-md:   14px;
  --text-lg:   16px;
  --text-xl:   18px;
  --text-2xl:  22px;

  /* ===== SPACING (4px base) ===== */
  --space-0:   0;
  --space-0.5: 2px;
  --space-1:   4px;
  --space-1.5: 6px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;

  /* ===== BORDERS ===== */
  --radius-sm:   2px;
  --radius-md:   4px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-full: 9999px;

  /* ===== SHADOWS (dark mode — minimal) ===== */
  --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.30);
  --shadow-tooltip:  0 2px 8px rgba(0, 0, 0, 0.30);
  --shadow-modal:    0 16px 48px rgba(0, 0, 0, 0.40), 0 4px 12px rgba(0, 0, 0, 0.20);

  /* ===== TRANSITIONS ===== */
  --transition-fast:   120ms ease;
  --transition-normal: 200ms ease;
  --transition-slow:   300ms ease;

  /* ===== LAYOUT ===== */
  --sidebar-width:       280px;
  --panel-header-height: 40px;
  --status-bar-height:   28px;
  --scrollbar-width:     8px;
}
```

### Legacy Variable Migration

The current codebase uses `--bg-primary`, `--bg-secondary`, etc. Here's the mapping:

| Old Variable | New Variable |
|-------------|-------------|
| `--bg-primary` | `--color-bg-base` |
| `--bg-secondary` | `--color-bg-surface-0` |
| `--bg-tertiary` | `--color-bg-surface-2` |
| `--bg-surface` | `--color-bg-surface-1` |
| `--bg-hover` | `--color-bg-surface-1` (used for hover) |
| `--text-primary` | `--color-text-primary` |
| `--text-secondary` | `--color-text-secondary` |
| `--text-muted` | `--color-text-tertiary` |
| `--accent` | `--color-accent` |
| `--accent-hover` | `--color-accent-hover` |
| `--success` | `--color-success` |
| `--warning` | `--color-warning` |
| `--error` | `--color-error` |
| `--border` | `--color-border-subtle` |
| `--radius` | `--radius-md` |
| `--shadow` | `--shadow-dropdown` |

---

## 12. Component Status Map

Tracks which components exist, which need redesign, and which are planned.

### Existing (Need Redesign)

| Component | Current State | Target State |
|-----------|--------------|-------------|
| Sidebar | Basic dark bg, no elevation system | Surface-0 bg, panel borders, section headers |
| Project list items | Hover only, no active border | Active = accent-subtle bg + left border |
| Instance list items | Same as project items | Same treatment + status dot |
| Tabs | Basic bottom border | Unity-style bottom indicator tabs |
| Mod cards | Basic bordered cards | Subtle border, hover border brightening |
| Buttons (primary) | Blue bg, basic hover | Accent color system, pressed state |
| Buttons (secondary) | Bordered, basic | Consistent height, hover brightening |
| Modals | Basic overlay + box | Surface-3 bg, stronger shadow, animation |
| Inputs | Basic border + focus | Sunken bg, accent focus ring with box-shadow |
| Search bar | Basic flex layout | Search icon, sunken input, proper sizing |
| Progress bar | 6px blue bar | 4px accent bar, smooth transition |
| Log output | Monospace, basic | Sunken bg, subtle border, proper sizing |
| Scrollbar | Basic webkit | Thinner, subtle, hover brightening |
| Error banner | Red bg tint | Error-subtle bg, proper border, icon |

### Planned (Not Yet Built)

| Component | Priority | Notes |
|-----------|----------|-------|
| Inspector panel | High | Right panel, 320px, collapsible |
| Status bar | High | Bottom bar, 28px, project health |
| Toggle switch | High | For mod enable/disable (replaces btn-toggle) |
| Breadcrumbs | Medium | For navigation depth |
| Context menus | Medium | Right-click actions on items |
| Toast notifications | Medium | Non-blocking feedback |
| Skeleton loaders | Low | For async data loading |
| Resizable panels | Low | Sidebar/inspector width adjustment |

---

*This design system is the authoritative reference for all UI work in Modpack Engine. When in conflict between this document and existing code, this document wins. Update this document as design decisions evolve.*
