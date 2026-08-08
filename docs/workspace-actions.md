# Workspace Action Bar

How the project-level actions are organized across the workspace chrome
(header + status bar). Applies to `frontend/src/components/common/topbar.tsx`
and `frontend/src/components/common/statusbar.tsx`.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ header: [Projects] Pack Name · MC 1.21.1 · Forge · v1.0  [Save] [Refresh] [Test] [Project ▾] │
├──────────────────────────────────────────────────────────────┤
│ tabs                                                        │
├──────────────────────────────────────────────────────────────┤
│ content (mods / configs / progression / quests / recipes)    │
├──────────────────────────────────────────────────────────────┤
│ status bar: [● Instance Connected][⟳]   [run / deploy feedback] │
└──────────────────────────────────────────────────────────────┘
```

## Action hierarchy

| Action | Location | Style | When |
| ------ | -------- | ----- | ---- |
| Projects (back) | header, left of title | `btn-secondary` | always; returns to the launcher (guarded by the dirty-pack prompt) |
| Save | header | `btn-secondary` | always; persists project metadata (`save_project` is an explicit save point — real per-editor work saves in its own toolbar) |
| Refresh | header | `btn-secondary` | only when a pack is loaded; re-runs the cache-aware load pipeline (see `docs/load-pack.md`) |
| Test | header | `btn-primary` | always; launches the pack in Minecraft via the companion mod |
| Refresh | Project menu → Pack | menu item | only when a pack is loaded; same as the header button |
| Force Full Re-index | Project menu → Pack | menu item | only when a pack is loaded; Refresh with the ingest cache discarded |
| Close Pack | Project menu → Pack | menu item | only when a pack is loaded; same as Projects back |
| Deploy Companion | Project menu → Setup | menu item | always; installs the companion mod into the instance |
| Export | Project menu → Share | menu item | always; opens the Export modal (.mrpack / CurseForge) |
| Delete | Project menu (separator + danger) | danger menu item | always; gated by the existing DeleteConfirmModal |

Exactly one accent-filled primary button is visible: **Test**. Rare and
destructive actions live behind the **Project** dropdown (same pattern as the
quest toolbar's `import-menu.tsx`), so the header never shows more than three
or four controls. The old **Load Pack** primary button is gone — opening a pack
from the launcher loads it (see `docs/launcher.md`).

## Leaving a dirty pack

The **Projects** back button (and **Close Pack**) route through
`useAppState.requestClosePack`, which checks the dirty surfaces:

- **Config editor** — `configDirty` from `useConfigState` (in-memory config
  edits not yet written).

If dirty, a **Save / Discard / Cancel** modal (`LeavePackModal`) is shown:

- **Save** — flushes `saveConfigFile` (and any pending graph auto-save), then
  closes the pack.
- **Discard** — closes the pack, dropping the in-memory config edits.
- **Cancel** — stays in the workspace.

Quest graph edits are already persisted to the database by the quest editor's
debounced auto-save, so they are not a blocking dirty surface.

## Status bar

The bottom `workspace-statusbar` carries *system state* instead of toolbar
chrome:

- **Left** — the connection pill: a five-state ladder (`Instance Connected` /
  `Instance Offline` / `Companion not deployed` / `Bridge offline` /
  `Instance running, companion missing`) derived in
  `frontend/src/services/connection-status.ts` from socket + deployment +
  launch-tracking signals, with the "how to reach green" manual in the title
  tooltip. Two compact icon buttons sit next to it:
  - **Power icon** — *restart the game instance*: sends `STOP_INSTANCE` to the
    companion (which calls `Minecraft.getInstance().stop()`), waits for the
    game to exit, then relaunches through the normal launch path — which
    re-deploys the companion mod, so a freshly built jar takes effect on the
    next boot (the `launch.rs` deploy step). Orchestration lives in
    `useLaunchState.handleRestartInstance` (`frontend/src/hooks/useLaunchState.ts`),
    gated on the instance actually running; the relaunch reuses the Test flow.
    Disabled while a launch/restart is in flight. Keyboard shortcuts do not
    work in this app (Tauri v2/WebKitGTK), so this is a visible button.
  - **Refresh icon** — restarts the bridge server (`ws-action-btn`).
  - The same restart flow is triggerable from the terminal for dev loops:
    `node scripts/restart-instance.mjs` connects to the hub as a **tool**
    peer (`client: "modcanvas-tool"`), sends `RESTART_INSTANCE`, and the hub
    routes it to the app peer, which runs the identical orchestration. Tool
    peers are deliberately excluded from the companion count so the pill does
    not flash a false "Instance Connected" while the script is attached.
- **Right** — live run feedback: `Testing… <progress>` with a spinner while a
  test is launching, the final test outcome, a truncated `Test failed: <first
  line>` with a **Copy** button when a launch errors (full trace in the title
  tooltip), and transient Deploy Companion messages (success / error, glyph
  stripped).

## Files

- `frontend/src/components/common/topbar.tsx` — header + Project menu.
- `frontend/src/components/common/statusbar.tsx` — workspace status bar.
- `frontend/src/hooks/useLaunchState.ts` — Test / restart-instance / deploy
  orchestration (owns `handleRestartInstance`).
- `frontend/src/services/restart-instance.ts` — `isInstanceRunning` +
  `waitForInstanceExit` (poll loop with injected check, unit-tested).
- `scripts/restart-instance.mjs` — terminal trigger for the restart flow
  (tool peer → `RESTART_INSTANCE` frame).
- `src-tauri/src/ws_protocol.rs` — `STOP_INSTANCE` / `RESTART_INSTANCE` event
  names and the `ClientRole::Tool` classification.
- `frontend/src/components/common/ProjectWorkspace.tsx` — wiring; renders both.
- `frontend/src/components/common/LeavePackModal.tsx` — Save / Discard / Cancel
  dirty-pack guard.
- `frontend/src/hooks/useAppState.ts` — `requestClosePack`, `saveAndClosePack`,
  `discardAndClosePack`, `cancelLeavePack`.
- `frontend/src/App.css` — `.workspace-header`, `.project-menu*`,
  `.workspace-statusbar`, `.statusbar-*` styles.
- Tests: `frontend/src/components/common/topbar.test.tsx`,
  `frontend/src/components/common/statusbar.test.tsx`,
  `frontend/src/services/restart-instance.test.ts`.
