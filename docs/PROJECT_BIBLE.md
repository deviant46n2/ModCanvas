# ModCanvas — Project Bible

> The authoritative reference for **what ModCanvas is, why it exists, where it is going, and the rules for getting there.**
> This is the roadmap and ruleset. When any other doc, plan, or feature idea conflicts with this document, this document wins — until it is deliberately amended here.

**Status:** Living document. Amend it as decisions change; that is the only way it dies.
**Owner:** Project maintainer.
**Related docs:** `README.md` (public front page), `AGENTS.md` (execution constraints for AI agents), `docs/design.md` (visual design system), `docs/*.md` (per-feature records).

---

## 1. Mission

**ModCanvas is a professional, offline-first desktop workbench for authoring Minecraft modpacks — so you never have to boot the game just to tweak, create, or validate content. You open Minecraft when you *want* to test, never because you *have* to.**

Two audiences, one tool:

- **Beginners** who want to make their first pack without learning to program.
- **Veterans** who want to make their tenth pack without ceremony.

Both are served by the same product: an editor that removes the *coding prerequisite* and the *restart-to-test tax*.

---

## 2. The Problem (evidence, not opinion)

Modpack authoring today is fragmented, hostile to newcomers, and punished by the boot loop. This section records the real-world evidence that shapes the product.

### 2.1 The boot-to-test loop

- FTB Quests config files do **not** update while the game runs, and `/reload` does **not** pick up file edits. Testing any change means **restarting the whole game** — *"Considering how long it takes to restart the game in a large pack, this is quite inconvenient."* (FTB-Mods-Issues #492)
- Veteran pack devs confirm the toll: *"Since I'm closing and relaunching over and over it's faster when less mods are loading."* (r/feedthebeast)
- Even the newest in-game IDEs admit item/block edits are *"startup edits: they apply on game restart, not /reload."* (KubeJS Studio)
- **Inference:** the loop is the real tax, and it applies to both audiences. It is the core thing ModCanvas removes.

### 2.2 The coding prerequisite

- The standard advice to first-time pack makers is literally *"familiarize yourself with KubeJS, and programming in general."* That is the barrier: **modpack authoring currently requires learning to code.**
- Hand-writing recipes/scripts is the norm: *"Writing a modpack means writing hundreds of KubeJS recipes, tag edits, and loot tweaks by hand. That is a lot of syntax to remember, a lot of item IDs to look up, and a lot of /reloads that may or may not break."* (KubeJS Studio)
- **Inference:** removing the coding requirement is the beginner wedge. The wizard + templates + mini-wizards exist for this exact reason.

### 2.3 Raw config & file torture

- *"If you've ever spent twenty minutes hunting through .toml files just to flip one setting, this is for you."* — Monfig (a tool built purely to fix this)
- MeatballCraft's dev: *"I started off by reading every single mod's config."*
- **Inference:** structured config editing (forms, not raw text) is table stakes — but as Monfig's near-zero adoption shows, **config editing alone is not a wedge.** It must be part of a whole loop.

### 2.4 The in-game editors are not workbenches

- Quest editing in-game is tedious: *"Creating quests one at a time is repetitive and tedious, especially when creating very similar quests."* (#699) — the alternative is hand-editing SNBT files, *"a huge pain due to needing to find all the relevant item/advancement/biome names, put them in the correct format."*
- No copy/paste, no newlines mid-line, no live feedback in the in-game editor (#492).
- **Inference:** a real, offline quest canvas with copy/paste, bulk ops, undo/redo, and instant validation beats the in-game editor on every axis.

### 2.5 Tool fragmentation

- The ecosystem is **50+ single-purpose mods**, each with its own authoring language (KubeJS JS, CraftTweaker ZenScript, JSON, TOML, datapacks) and its own loader support matrix.
- **Inference:** nobody owns the whole authoring workflow. That is the empty niche ModCanvas occupies.

### 2.6 Veterans live on plain text and version control

- *"Use VS Code and some sort of version control like Git. It can be extremely hard to remember everything you changed."*
- Change-tracking is done manually in spreadsheets. *"I keep a simple log of changes. That comes in handy when a tweak I made broke something further down the road."* — and *"most useful program is Excel/Google Sheets."*
- KubeJS Studio's #1 selling point is that it emits real scripts — *"no black-box save format… you can keep, version, and share."*
- **Inference:** veterans will not adopt a tool that owns their content. **ModCanvas must always read/write the same plain-text artifacts the ecosystem already uses.**

---

## 3. What ModCanvas IS

- **A workbench shell** (project tree, global search, per-type editors, pack health) around **type-appropriate editing surfaces**.
- **A faithful editor** for existing pack formats: FTB Quests, KubeJS, CraftTweaker, vanilla datapacks, config files.
- **An offline validator** — the go/no-go that tells you the pack is *file-level* sound before you boot.
- **A teacher** — guided wizards, templates, and mini-wizards that remove the coding requirement without removing the user's agency.
- **A companion to launchers** — it attaches to existing Prism/CurseForge instances and delegates launching. It is **not** a launcher, and it never handles Microsoft OAuth.

### 3.1 Surface selection rule

The content type dictates the surface:

| Content | Surface | Why |
|---|---|---|
| Quests | **Canvas** | Spatial: nodes, dependency curves, layout. WYSIWYG is required. |
| Configs | **Typed forms** | Tree-structured settings; forms with types/ranges beat raw TOML. |
| KubeJS / CraftTweaker | **Hybrid** (structured builder + raw editor) | Veterans hand-edit; beginners need the builder. |
| Recipes | **Structured editor** | Visual grid, validation, non-clobber saves. |
| Textures | **Lazy materialization** | Never bundled; resolved from instance at runtime. |

The one unifying layer is the **pack-health view**: a project-wide panel that only a workbench shell can provide.

---

## 4. The Trust Rule (non-negotiable)

**ModCanvas's promise is "you don't have to boot the game to test." The moment a booted game contradicts ModCanvas's offline verdict, trust is lost — and this is a one-strike product.**

Therefore:

1. **ModCanvas validates files, never simulates the game.** It can guarantee file-level correctness: syntax, references, item/quest/recipe IDs, cross-references, version-boundary rules (via the adapter matrix). It can **never** guarantee runtime behavior: classloading, mixin conflicts, script execution order.
2. **Position the promise precisely:** *"ModCanvas catches everything that is a file problem before you boot, so boot time is reserved for runtime-only surprises."*
3. **The health panel's go/no-go must never lie.** "GO" means "ready to **test**," never "ready to ship," never "will definitely run."
4. **Do not scope-creep into "we simulate the game."** That is a research project the size of reimplementing a loader, and it is a trap.
5. **Every error display has a Copy button.** Error messages are shared in bug reports and Discord. Make it effortless.

---

## 5. Product Rules

### 5.1 Offline-first, deterministic

- The core app runs with **zero mandatory network, cloud, or LLM dependencies**.
- Analysis must be deterministic: a **pure function of already-materialized state**. Never analyze on demand — analyze at load, patch on save.
- **No AI integration at launch, full stop.** Reconsider only if the community asks for it, and even then only for **log deciphering** — never content generation.

### 5.2 No lock-in

- **Outputs are always faithful ecosystem artifacts** (real SNBT, real `.js`, real `.json`). Users can abandon ModCanvas and keep everything they made.
- **Private editing state is always disposable.** App-private formats (`.modcanvas/quests.json`, bezier data, history journal) are editing conveniences, never the output format, and never leak into exports.
- The companion mod is a *better runtime*, never a *faster way to lose your work*.

### 5.3 Comment & file safety

- Never overwrite user files directly. Atomic `.tmp` + rename; Windows `EBUSY` retry loop.
- Preserve user comments and custom formatting in `.snbt`, `.json5`, KubeJS `.js`.
- All writes scoped strictly inside the project/instance root; path traversal and symlink escapes rejected.

### 5.4 No bundling of game assets

- Never bundle image bytes extracted from `.jar` files or instances. Texture data lives in the compact descriptor index; PNGs are materialized lazily at runtime. The on-disk texture cache stores descriptors, never bytes.

### 5.5 Version / loader discipline

- Version support is **demand- and contributor-driven, never speculative.** One primary target, full fidelity, then expand.
- All version/loader-specific logic lives behind the adapter matrix (`IMinecraftVersionAdapter`, `getAdapter(mcVersion, loader)`). Adding a version = new adapter file, never edits to existing ones.

---

## 6. What ModCanvas is NOT (scope guardrails)

These are anti-scope rules. Drift into any of these is a decision that must be made here, in this document, before it is made in code.

- **NOT a launcher.** It attaches to existing Prism/CurseForge instances. It never handles Microsoft OAuth/DRM — Prism already owns that trust and that pain. `Test` delegates launch to the launcher via the companion mod.
- **NOT an AI content generator.** No AI slop. See §5.1.
- **NOT a version-chaser.** See §5.5.
- **NOT a mod-installer/distributor at MVP.** Curated mod *recommendations* may appear later, but full mod-installation management is out of MVP scope.
- **NOT a generic config tool.** Config editing is a surface, not the product. The product is the whole authoring + validation loop.
- **NOT a pack-quality guarantee.** The MVP sells *completion*, not quality. "Probably a bad pack" from a first-timer is a win.

---

## 7. Why not just use X (competitive guardrails)

| Tool | What it does | Why ModCanvas isn't it |
|---|---|---|
| **Prism / CurseForge** | Launchers + instance management | Not a launcher; delegates to them. Never competes. |
| **Monfig** | Config editing only | Config editing alone is not a wedge (≈0 adoption). ModCanvas is a whole loop. |
| **KubeJS Studio** | In-game KubeJS IDE | Requires booting the game; item/block edits need restart. ModCanvas is offline and full-pack. |
| **PW-GUI** | Pack packaging/distribution | Packaging only; not authoring. Possibly a later export integration. |
| **In-game FTB editor** | Quest editing in-game | No copy/paste, no bulk ops, no validation, restart to test. ModCanvas beats it on every axis offline. |
| **misode's generators** | Single-surface datapack generators | Browser single-purpose; not a workbench. |

---

## 8. Roadmap

### 8.0 Current state (as of this writing)

The workbench core is **largely built** — the veteran-facing power is already present:

- **Quests** — near-full FTB Quests 1.21.1 parity (canvas, tasks, rewards, reward tables, smart filters, quest links, bezier edges, grid snap, undo/redo, progress simulation, book/chapter/group settings, animated + baked 3D icons, theme presets). Parity checklist lives in `MODCANVAS_ROADMAP.md` §13.
- **Recipes** — KubeJS + CraftTweaker + vanilla, bidirectional scan (incl. mod jars), JSON paste-import, validation, non-clobber saves.
- **Configs** — structured + raw editors, in-place on the real instance `config/`, comment-preserving atomic writes.
- **Pack lifecycle** — attach instance, scan textures, import/export FTB quests (flat + subdirs), import `.mrpack`/packwiz/CurseForge, export, launch via companion mod.
- **Global history** — durable journal, cross-tool Ctrl+Z, timeline drawer.
- **Runtime hot-swap** — WebSocket IPC + companion mod (multiple variants exist; see §8.4).

**The gap is not the editor. It is the beginner layer.** Today a first-time user faces a fully-armed IDE.

### 8.1 MVP — "A beginner completes a pack"

**Exit criterion (falsifiable):** A person with zero modpack experience can, using only in-app guidance, create and launch a playable-but-not-great pack on **1.21.1 / NeoForge** — without ever seeing or writing a line of code.

The MVP's job is to build the **guided wrapper** that hides the power that already exists:

1. **First-Pack wizard** — instance pick (existing Prism instance or browse), one plain-language question ("your pack is about…"), template selection, optional curated mod picks, a guided first quest, then **the green check + Launch**.
2. **Pack Health panel** — the persistent go/no-go surface. See §9.
3. **Mini-wizards** — thin guided overlays on existing editors (e.g. "Add a quest") that run through the *same* editor the veteran uses. See §10.
4. **Beginner Mode** — an IDE mode that hides raw/code surfaces and shows simplified forms. See §11.
5. **Distribution** — README (this repo), license, release pipeline (CI), and a public home. **None exist today.**

**MVP scope boundaries:** 1.21.1 / NeoForge only. FTB Quests is the only quest format. No AI. No mod-installation. No new versions.

### 8.2 Post-MVP — veteran depth

- Pack Health progression topology (bottlenecks, walls, chain lengths) — pure graph math, truthful.
- Import/export hardening (layout choice, `min_width`/`invisible` alias unification, `chapter_groups.snbt`, quest `tags`).
- Description editor: multi-page + inline images.
- Theme-file fidelity (`ftb_quests_theme.txt` parsing → edge/panel/checkmark rendering).
- Remaining book-level settings (emergency items, lock message, book icon picker, fallback locale, save-as-file).
- Rest of the 1.21.1 loader matrix (Forge, Fabric).
- Newer stable MC versions as they stabilize. Older versions: stretch goals / contributor additions only.

### 8.3 Endgame (very far in the future)

- **ModCanvas's own companion mod** that handles recipes, quests, mixins, and textures natively — the one-stop runtime.
- **Third-party editing always remains**: ModCanvas keeps working as the cockpit for KubeJS, FTB Quests, and the existing ecosystem. **No lock-in, ever.**
- **Release model for the mod:** code stays GPL-3.0 forever; nightly/alpha builds may be a Patreon perk, stable free. Never paywalled.

### 8.4 Companion mod status

- **Canonical companion resolved (todo.md Phase 3):** the 1.21.1 NeoForge
  variant (`workbench-companion-neoforge-1.21`) is the sole supported target.
  The fabric/forge/legacy-neoforge variants are archived under
  `workbench-companion-archived/` and the deploy matrix
  (`src-tauri/src/minecraft/companion.rs`) deploys NeoForge only. Hotswap reload commands
  (`RELOAD_*`) are frozen; the WS server, engine-render capture, and runtime
  texture extraction remain live.
- **The companion is MVP-adjacent, not endgame**: the beginner's final act ("Launch your pack") depends on it. Companion install + basic hot-reload stability is a v1 blocker.

---

## 9. Pack Health panel

**The health panel is a project-wide go/no-go surface and a differentiator — it shows for both wizard-built AND imported packs.** It is a persistent "status of the whole project," not a one-time checklist.

### 9.1 States

Every section gets three honest states, never two:

- **Blocking** — it will break the game (dead references, invalid syntax, unresolved IDs). Must be fixed to launch.
- **Recommended** — completes the pack story (cover image, pack info, an empty chapter). Never blocks.
- **Optional** — nice-to-have.

Example items: "recipes: 3 errors", "cover image still missing", "2 unused reward tables", "quest references an item ID that doesn't exist in this pack".

### 9.2 Architecture rule (deterministic + fast)

- The panel is a **pure function of already-materialized state** (the load-time scan caches). No on-demand rescans. Sub-millisecond render, patched incrementally on save.
- **Never put fuzzy analytics on the fast path.** Anything opinionated (mod-type percentages, difficulty) is computed on a separate, clearly-labeled, slower path — never part of go/no-go, never something the panel waits on.

### 9.3 Analytics tiers

1. **Reference integrity + coverage** (MVP) — truthful, screenshotable.
2. **Progression topology** (veteran win) — bottlenecks, walls, chain lengths, pacing. Pure graph math; no opinion.
3. **Flavor analytics** (later, stretch) — mod-type percentages (5% tech / 12% magic), difficulty. **Labeled as estimates** and built only after the panel has earned trust. Mod-% has a taxonomy-maintenance burden (CurseForge/Modrinth tags are coarse and sometimes wrong); difficulty is player-subjective and should be reframed or dropped.

### 9.4 Trust ceiling

The panel's power is that tiers 1–2 are *true*. Every step of scope creep toward tier 3 risks the credibility that makes the panel work.

---

## 10. Wizard & mini-wizards

### 10.1 Design principle

**The wizard is not a one-time flow — it's a wrapper that stays.** It gets the user to first launch, then remains as a "next suggested step" feed. Helpers throughout, not just at the start.

### 10.2 First-Pack wizard flow

The start is a **user choice, not detection** (s49): a four-card StartChooser
offers Intro (guided, ends in Beginner Mode), IDE Tour (feature walkthrough,
full IDE), Blank (empty pack, straight to the IDE), and Load (existing
projects). The chooser owns the template + where decisions; the wizard is a
thin commit point from there:

1. **Name your pack** — one input; ModCanvas auto-creates a fresh Prism
   instance (MC 1.21.1 · NeoForge, the first supported combo). No technical
   where-question is asked of a beginner.
2. **Curated mod picks (optional)** — a short "these go well together" list, defaults pre-checked. Not a 10k-item browser.
3. **Guided first quest** — "pick an item → pick a goal → wizard writes the quest." The zero-code proof point, emitted as real SNBT.
4. **The green check** — diagnostics pass, one button: **Launch** (delegated to Prism via Test).

Blank starts skip steps 2–4 and land in the IDE immediately.

### 10.3 Template commit level

Templates **pre-fill content the user can see and understand** (a labeled starter quest chain), because editing existing content is easier to learn from than creating from blank. The bar is "probably a bad pack," so coherency matters more than ownership.

### 10.4 Mini-wizards

- Thin, task-scoped guides ("Add a quest") that run through **the exact same editor** a veteran uses — never a parallel generation path that produces un-editable output.
- The mini-wizard is a teacher; the editor is the classroom. Users must always be able to see what it made and where it lives.

---

## 11. Beginner Mode

- A mode of the full IDE that **hides the scary stuff**: raw/code surfaces hidden, configs shown as simplified forms only, visual editing for most tasks.
- **Onboarding turns it ON for first-timers.** It is "off by default" for everyone else — veterans and returning users never see it. This reconciles "we don't assume" with "we protect the person we're onboarding."
- **One obvious control** switches between Beginner Mode and the full IDE. Easy to find, easy to flip both ways.

---

## 12. Funding & business

- **GPL-3.0 open source** — for ModCanvas the app **and** the companion mod. Contributions welcome.
- **Per-artifact licensing:** small utility/parsing libraries published separately should use permissive licenses (e.g. MIT) — GPL on libraries is where contamination-friction genuinely bites.
- **Patreon** ("just to get by") is the funding mechanism. Community-first, not corporate.
- **Companion mod release:** code copyleft forever; Patreon = early access (nightly/alpha), stable free. No paywall on finished work.
- **AI:** none at launch; community-demanded log-deciphering only, never content generation.

---

## 13. MVP success metrics

Beyond the exit criterion in §8.1, success is measured by the community outcomes that funding depends on:

- A first-time user records "I made my first modpack and never wrote a line of code" — the Reddit/demo moment.
- A pack health panel that users trust enough to share screenshots of (blocking/recommended counts).
- Fresh-eyes testers: the beginner layer must be validated by *actual beginners*, not the author.

---

## 14. Known risks & open decisions

1. **You can't test the beginner UX — you are the power user.** The MVP acceptance is "a beginner completes a pack," and you can't be that test subject, and there's no community yet. **Fresh-eyes testers must be an explicit early milestone.**
2. **License choice has ecosystem consequences.** **Decided: GPL-3.0 for both the app and the companion mod.** GPL stops closed-source forking of the work but does **not** prevent commercial use — that is the copyleft deal, chosen deliberately. GPL mods coexist fine with MIT/ARR mods (each jar is a separate work), though some pack authors still avoid GPL on principle; the app is unaffected by that friction. Small standalone libraries use permissive licenses. **A LICENSE file must be added.**
3. **Companion mod state is fragmented** — four variants. Declare the canonical 1.21.1 NeoForge variant and reconcile the rest.
4. **No CI / release pipeline.** The stale-binary footgun is documented (`AGENTS.md`). CI (frontend tests + cargo test + release artifacts) is also the first release pipeline — required for the launch.
5. **"Probably a bad pack" still crashes sometimes.** The health panel said GO, then it crashed. Define the response: the panel's honest scope, and a "crash helped" path — where community-demanded log-deciphering AI belongs.
6. **Determinism ceiling.** Analysis must stay a pure function of cached state; fuzzy analytics are quarantined (§9.3).
7. **Windows reality.** The modded-MC crowd is overwhelmingly Windows; the project is developed on Linux. Windows builds and `EBUSY` behavior need real verification before the launch audience is reached.

---

## 15. Open questions

- Patreon tier structure and nightly/stable split specifics.
- Whether curated mod recommendations enter MVP or post-MVP.
- Naming/positioning of the health panel (health panel vs dashboard) — final label TBD.
- CI provider and where releases are published.

---

*This document is the roadmap and the ruleset. Amend it deliberately; ignore it at your own cost.*
