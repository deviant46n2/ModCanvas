# Session Handoff — 2026-08-14 (s55: the flatpak arc + wizard rework + health ruling)

Branch `master`. All s55 work committed and pushed on top of `2ba5d8e`.

## WHAT WE BUILT (one line)

ModCanvas became a working Flatpak paired with Flatpak Prism — the MVP
deployment shape (the friend's Bazzite is flatpak-first) — and the wizard
learned to be honest about the one thing the app can't do: FTB Quests
installs in Prism, on a dedicated forced step, while everything else
auto-installs keylessly on Continue, and missing required deps warn
persistently in Pack Health without ever gating launch.

## DONE

- **Flatpak distribution** (`flatpak/com.modcanvas.app.yml` + desktop, new):
  direct-binary wrap of `target/release/modcanvas` on **org.gnome.Platform 50**
  (NOT the EOL 47 — its webkit crash-killed the app at webview init ~80% of
  launches; strace-verified wholesale thread SIGKILL with webkit exiting
  CLEANLY; Trayscale-on-50 control proved webkit-in-flatpak works on current
  runtimes). Bundles the companion jar (`/app/share/modcanvas/companion/`) and
  `libbz2.so.1.0` (the GNOME runtime lacks bzip2 — host .so, ABI-frozen,
  ledgered LOCAL-TEST DIVERGENCE for the Flathub variant). finish-args:
  wayland/x11/dri/ipc/network, `--filesystem` grants for BOTH Prism roots
  (`:create`), `--talk-name` org.freedesktop.secrets + org.freedesktop.Flatpak,
  NO `WEBKIT_DISABLE_DMABUF_RENDERER` (the AppImage's fix; it breaks the
  sandbox render). **Build loop: `pnpm build` → `cargo build --release
  --features custom-protocol` → `flatpak-builder --force-clean --user
  --install`** — the plain `cargo build --release` omission of custom-protocol
  is what produced the 3-hour white-screen saga (dev-mode binary loading
  localhost:5173).
- **Driver's third form** (`launcher.rs`): sandboxed app detection
  (`container=flatpak` + `FLATPAK_ID` env) → binary `flatpak-spawn` with args
  `["--host","flatpak","run","org.prismlauncher.PrismLauncher",…]`; pure
  `prism_invoke_prefix` + tests. Open-Prism from inside the sandbox verified
  live (`flatpak-spawn --host flatpak run … --show Monster` in the process
  table).
- **Walled-garden instance roots** (`launcher.rs` `home_instance_roots`):
  instance creation target (`base_dirs[0]`) now aligns with the spawned
  binary — flatpak forms create into the flatpak root FIRST (the flatpak
  Prism can't see the native root). Live bug fixed: an instance created in
  the native root vanished from the flatpak Prism. Scanning still covers both
  roots. Test-locked.
- **Companion jar lookup** (`companion.rs`): bundled-path first
  (exe-relative `../share/modcanvas/companion/`), repo paths as dev fallback.
  Also fixes a latent AppImage bug — the hardcoded `/home/deviant` path never
  worked on any other machine.
- **Wizard rework** (student-directed):
  - `PrismGuideStep.tsx` (new): FTB Quests installs get a DEDICATED step with
    the exact walkthrough (Open Prism → select instance → **Edit** → Mods →
    Download Mods → switch source to **CurseForge** → search/install → accept
    FTB Library / FTB Teams / Architectury), its own Open Prism button, manual
    fallback, **no Skip** — forced learning (the one thing the app can't do).
  - `CuratedModsStep.tsx`: the misleading "Open Prism to install these" button
    REMOVED (Modrinth picks install in-app; only FTB Quests needs Prism); CF
    picks filtered from the row list (header points to the next step);
    **Continue auto-installs the ticked Modrinth picks** (keyless API —
    student's expectation, now delivered) with progress; dep loop still closes
    inline (s54-A); compat results feed the health store.
  - `WizardStepper.tsx`: conditional step 3 (Prism guide), dynamic step count,
    overlay no longer closes on outside-click during steps 2-4 (explicit
    "Cancel (pack stays open)").
  - `HealthLaunchStep.tsx`: reads depIssues from the store.
- **Health ruling — roadmap §0 row 7 RULED + DONE** (student ruling: "warn,
  never gate — they dont wanna install a mod right now"): missing required
  deps surface as a persistent **recommended** (non-blocking) finding in Pack
  Health's Mods section (`checkMissingDeps`), fed by every compat-check site
  (Mods tab `useModState`, wizard step 2) into the pack-health store; Launch
  stays open. The core-mod gate (FTB Quests + KubeJS — ModCanvas's OWN deps)
  remains blocking and separate. Docs: mods-tab.md + roadmap §0 row 7.

## TESTS / STATE

- 727 FE (84 files) + 453 Rust tests green; `pnpm integrity` **0 violations**
  (dev + release binaries rebuilt, doc-sync judgments clean); flatpak build
  installed + verified on this box (render, instance scan, Open-Prism,
  bundled companion).

## NEXT

- **The last unverified link in the flatpak pair: launch a game.** Friend-trial
  core flow — wizard → mods → quests → **launch → companion connects over
  9876 → 3D icons render**. The loopback is shared (verified), the bridge port
  is bound by the flatpak app (verified), but a real game launch through the
  flatpak pair has not happened.
- **Student's own switch**: migrate his native-root instances (To the Sky,
  ATM10SKY, monster) into the flatpak root — the flatpak Prism can't see the
  native root; the app still lists them (known unbooked UX gap).
- **Flathub variant** when the friend install is proven: from-source manifest
  (rust/node sdk-extensions, bzip2 from source, metainfo) — deliberately not
  built yet.
- Spine P2 row 5 (atomic writes) on the student's call; re-reviews 08-19 /
  08-20 / 08-21.
- Unbooked: the native-root instances visible-but-unlaunchable in the app;
  the AppImage doesn't bundle the companion jar (tauri resources — the
  friend's AppImage would fail to deploy the companion).

## GOTCHAS

- `code:gotcha` flatpak release build MUST use `--features custom-protocol` (white-screen lesson; Cargo.toml comment says it) — mem_1786747845229
- `code:gotcha` EOL GNOME 47 runtime webkit crash-kills the app at init (use 49/50) — mem_1786747847424
- `code:gotcha` flatpak-spawn --host needs `--talk-name=org.freedesktop.Flatpak` — mem_1786747848927
- `code:gotcha` Prism walled gardens: creation root must align with the spawned binary — mem_1786747868586
- `code:gotcha` companion jar lookup was dev-path-only (latent AppImage bug too) — bundled path now first — mem_1786747870038

## DECISIONS

- `code:decision` Flatpak distribution shape: direct-binary wrap, GNOME 50, libbz2 host-.so divergence ledgered, build loop — mem_1786747871749
- `code:session` s55 session log + NEXT — mem_1786747873496
- Roadmap §0 row 7 (dep-gate): **warn persistently, never gate** — RULED by the student s55; shipped.
- Wizard: FTB Quests = dedicated forced step (no Skip); CF picks absent from the curated row list; Continue auto-installs ticked Modrinth picks.
