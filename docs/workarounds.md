# Workaround Register — lived-experience facts that never made it into code

The s21 cont.4 lesson: the maintainer withheld "restart the app to refresh
textures" for weeks — a real, working workaround that died in one person's
head. This register exists so every such fact is surfaced at diagnostic
start, never hoarded. The `/workaround` command (and `/verify` step 6) enforces
consulting it.

| # | Workaround | When it applies | Why it works | Discovered |
|---|---|---|---|---|
| 1 | Restart the app to refresh stale icons/textures after engine or companion changes | Editor shows old icons after a backend/companion change | The app binary embeds the frontend AND backend; a stale process keeps serving the old cache (AGENTS.md rebuild rule) | s21 cont.4 (withheld for weeks — the lesson) |
| 2 | Read `debug.log`, not `latest.log`, for companion probes | Looking for probe output after a run | `latest.log` ROTATES AT MIDNIGHT — reading it alone faked a "no probes" read | s21 close |
| 3 | Verify a deployed jar actually RAN, not that it exists | After any companion rebuild/deploy | File existence ≠ new code: check md5 differs AND the new symbol is present (`javap -p -verbose`); `strings` won't show float constants | s14 |
| 4 | Kill a lingering game process before relaunch | Launch "fails" or the game doesn't come up | A stale game process holds the old jar in memory — mods load once at startup; the wrapper may be dead while the game lives | s21 cont.3 |
| 5 | Bump `engine_renders.rs` CACHE_VERSION in the SAME pass as a renderer-semantics change, then restart the app | Any companion change to shading/sampler/format semantics | The disk cache validates on version mismatch; an old binary keeps serving the stale cache | s14 / s21 |

## Rules of the register

- Consult it at the start of every diagnostic; ask the student for their own
  lived-experience workarounds before proposing theories (they have some we
  don't — see #1).
- New workaround surfaced → add a row here with the date, in the same pass it
  is learned. Never let one die with a session.
- A workaround that gets fixed in code moves to "fixed" status with the commit
  hash — it stays as history, marked resolved.
