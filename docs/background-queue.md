# Background Queue — parked judgment calls (Autopilot mode, s70)

When the tutor is working autonomously (Autopilot mode) and a judgment call
interrupts but gets no answer, it is parked here with a written reason. The
queue empties at the next session start — nothing is decided silently, nothing
is forgotten.

## Format

```
- [date] WHAT (why it's a judgment call) — parked because no answer yet. Decided: YES/NO/ALTERNATIVE
```

## Items

- [2026-08-17] Scope the Tauri `test` harness (tauri::test mock_builder) as a
  maintenance item? (It would unlock: the parked e2e socket test, command-layer
  tests for all 70 AppHandle/State commands, state injection. Costs a dev-dep +
  test-feature surface. The park-with-reason at MODCANVAS_ROADMAP.md:1398 stands
  until a decision.) — parked because the scoping question was asked and not
  answered; the arc had already closed. Decided: PARKED (no answer given)