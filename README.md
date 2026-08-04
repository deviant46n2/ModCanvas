# ModCanvas

> **An offline-first desktop workbench for making Minecraft modpacks — without booting the game until you *want* to.**

ModCanvas is a professional development environment for Minecraft modpack creators. It attaches to your existing Prism/CurseForge instance and lets you author, validate, and polish your entire pack from one desktop app — no game launch required until you're ready to test.

![hero](frontend/src/assets/hero.png)

## Why ModCanvas?

Making a modpack today means one of two things:

- **Beginners** are told to *"familiarize yourself with KubeJS, and programming in general."* The coding prerequisite stops most people before they start.
- **Veterans** live in a loop of *close the game → edit a config → reopen → /reload → restart again* just to test one tweak.

ModCanvas removes both: **no code required, and no boot-to-discover-errors.** It catches file-level problems before you ever launch, so boot time is reserved for runtime-only surprises.

## What it does

| Surface | What you get |
|---|---|
| **Quests** | A WYSIWYG FTB Quests canvas: tasks, rewards, reward tables, smart filters, quest links, dependency curves, grid snapping, progress simulation, animated + baked 3D item icons. Faithful SNBT import/export. |
| **Recipes** | Visual editing for KubeJS, CraftTweaker, and vanilla datapacks — including scanning existing pack recipes and non-clobber saves. |
| **Configs** | Structured, typed forms over raw TOML/JSON/Properties/YAML — comment-preserving, atomic, in place. |
| **Progression** | A node-graph editor for mapping your pack's content flow, with a research-grounded vanilla template. |
| **Health** | *(planned)* A project-wide go/no-go panel — "recipes: 3 errors", "cover image missing" — so you know the pack is sound before you boot. |

Everything reads and writes the **real formats the modding ecosystem already uses** — real `.snbt`, real `.js`, real `.json`. No black-box save format, no lock-in: leave ModCanvas tomorrow and keep everything you made.

## Status

**Early development.** The veteran workbench core is functional on **Minecraft 1.21.1 / NeoForge** (FTB Quests). The beginner layer — first-pack wizard, pack health panel, beginner mode — is the active focus.

- **Supported:** 1.21.1 NeoForge · FTB Quests
- **Planned:** rest of the 1.21.1 loader matrix → newer stable versions (demand-driven)
- **Not a launcher:** attach to a Prism/CurseForge instance; launching is delegated.

See the [Project Bible](docs/PROJECT_BIBLE.md) for the full roadmap, ruleset, and "why not just use X" guardrails.

## Getting started (development)

Requires [Node.js](https://nodejs.org) + pnpm, [Rust](https://rustup.rs), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), and [Prism Launcher](https://prismlauncher.org/) for launching.

```bash
# install dependencies
pnpm install

# start the dev app (backend + hot-reloading frontend)
pnpm dev

# run tests / lint
cd frontend && pnpm test && pnpm lint
cargo test   # in src-tauri/
```

> **`pnpm dev` opens a blank window?** The dev server is pinned to
> `127.0.0.1:5173` (`frontend/vite.config.ts`) to match Tauri's `devUrl`.
> WebKitGTK resolves `localhost` over IPv4, and Vite's default IPv6-only bind
> silently yields an empty webview. If port 5173 is occupied by a stale Vite,
> `strictPort` now fails loudly instead of drifting — kill it with
> `pkill -x modcanvas; pkill -f 'node .*vite'` and retry.

## Documentation

- **[Project Bible](docs/PROJECT_BIBLE.md)** — mission, roadmap, and the ruleset that guides development.
- **[AGENTS.md](AGENTS.md)** — architectural principles & strict boundaries for AI coding agents.
- **[Design system](design.md)** — the Unity/Blender-class visual language.
- **[Feature parity](featureparity.md)** — ModCanvas ↔ FTB in-game editor gap checklist.
- **Feature records** — [`docs/`](docs/): quest editor, recipe editor, config editor, progression, history, load-pack flow, workspace actions.

## Contributing

Contributions are welcome — code, docs, tests, and ideas. See [CONTRIBUTING.md](CONTRIBUTING.md). We use Conventional Commits, and all contributions (AI-assisted or not) are held to the same bar: tests pass, docs stay current.

## License

**GPL-3.0** — ModCanvas and its companion mod. Small standalone libraries may use permissive licenses. See the [Project Bible](docs/PROJECT_BIBLE.md#14-known-risks--open-decisions).

---

*ModCanvas — build your pack offline. Launch when you're ready.*
