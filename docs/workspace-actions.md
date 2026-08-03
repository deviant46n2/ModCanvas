# Workspace Action Bar

How the project-level actions are organized across the workspace chrome
(header + status bar). Applies to `frontend/src/components/common/topbar.tsx`
and `frontend/src/components/common/statusbar.tsx`.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ header: [Pack Name · MC 1.21.1 · Forge · v1.0]  [Save] [Test] [Project ▾] │
├──────────────────────────────────────────────────────────────┤
│ tabs                                                        │
├──────────────────────────────────────────────────────────────┤
│ content (mods / configs / progression / quests / recipes)    │
├──────────────────────────────────────────────────────────────┤
│ status bar: [● Minecraft Connected][⟳]   [run / deploy feedback] │
└──────────────────────────────────────────────────────────────┘
```

## Action hierarchy

| Action | Location | Style | When |
| ------ | -------- | ----- | ---- |
| Load Pack | header | `btn-primary` | only when no pack is loaded — the primary action of that state |
| Save | header | `btn-secondary` | always; persists project metadata (`save_project` is an explicit save point — real per-editor work saves in its own toolbar) |
| Test | header | `btn-primary` when loaded, `btn-secondary` when unloaded | always; launches the pack in Minecraft via the companion mod |
| Close Pack | Project menu → Pack | menu item | only when a pack is loaded |
| Deploy Companion | Project menu → Setup | menu item | always; installs the companion mod into the instance |
| Export | Project menu → Share | menu item | always; opens the Export modal (.mrpack / CurseForge) |
| Delete | Project menu (separator + danger) | danger menu item | always; gated by the existing DeleteConfirmModal |

Exactly one accent-filled primary button is visible at any time: **Load Pack**
while the workspace is empty, **Test** once a pack is loaded. Rare and
destructive actions live behind the **Project** dropdown (same pattern as the
quest toolbar's `import-menu.tsx`), so the header never shows more than three
controls.

## Status bar

The bottom `workspace-statusbar` carries *system state* instead of toolbar
chrome:

- **Left** — WebSocket server pill (`Minecraft Connected` / `Offline / Idle`,
  port + client count in the title tooltip) and a compact **Restart** icon
  button (`ws-action-btn`).
- **Right** — live run feedback: `Testing… <progress>` with a spinner while a
  test is launching, the final test outcome, a truncated `Test failed: <first
  line>` with a **Copy** button when a launch errors (full trace in the title
  tooltip), and transient Deploy Companion messages (success / error, glyph
  stripped).

This replaced the old full-width `launch-progress` / `launch-error` banners
between the header and the tabs (which pushed the layout down when they
appeared) and the inline `deploy-companion-message` block in the header.

## Files

- `frontend/src/components/common/topbar.tsx` — header + Project menu.
- `frontend/src/components/common/statusbar.tsx` — workspace status bar.
- `frontend/src/components/common/ProjectWorkspace.tsx` — wiring; renders both.
- `frontend/src/App.css` — `.workspace-header`, `.project-menu*`,
  `.workspace-statusbar`, `.statusbar-*` styles.
- Tests: `frontend/src/components/common/topbar.test.tsx`,
  `frontend/src/components/common/statusbar.test.tsx`.
