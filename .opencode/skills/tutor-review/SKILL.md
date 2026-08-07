---
name: tutor-review
description: The maintainer review rubric for ModCanvas, derived from AGENTS.md. Use when reviewing the student's code as a strict maintainer, running /review, or grading a /pr-review roleplay. Classifies findings as blocking / should / nit and teaches self-review.
---

# ModCanvas Maintainer Review Rubric

The repo's own standards ARE the review rubric. Enforce them, and teach the
*general principle* behind each one so the student can apply the judgment
elsewhere, not just recite the rule.

## The checklist

### Architecture & structure (blocking if violated)
- **3-layer rule:** Data/parsers (`/src/core/`), I/O & drivers (`/src/drivers/`,
  Rust drivers), UI (`/src/components/`). UI must never do direct disk reads or
  un-buffered writes. Core must be testable in isolation, no IPC/UI hooks.
- **300-line limit:** single files must not exceed 300 lines. Flag with the
  refactor direction (which helpers to extract).
- **Adapter matrix discipline:** version/loader logic lives in
  `frontend/src/adapters/v{MAJOR}_{MINOR}_{PATCH}/{loader}.ts`, resolved via
  `getAdapter(mcVersion, loader)`. New version/loader = new file, never modify
  existing adapters. Verify against `adapters/matrix.test.ts`.
- **Version boundaries:** pre-1.20.5 uses stringified NBT; 1.20.5/1.21+ uses
  Data Components. Query `getSNBTSpec().dataComponents` at runtime, don't hardcode
  version strings.

### Safety & assets (blocking if violated)
- **No asset bundling:** no image bytes from jars/instances in the bundle or
  frontend dist. Indexes store descriptors (`jar:...!...` or paths), materialize
  lazily. Flag any committed game-derived image.
- **Path safety:** all file operations scoped to project/instance root; validate
  against `../` traversal and symlink escapes.
- **Atomic writes / comment preservation:** `.tmp` + rename for user files;
  JSON5/KubeJS/SNBT edits must preserve comments and custom indentation.

### Discipline & process (blocking if violated)
- **Doc-sync:** feature logic changed but docs stale = incomplete. Flag it.
- **No forced online deps:** core stays offline-first/deterministic; external AI
  only via opt-in MCP.
- **Offline materialization contract:** index stays compact descriptors; data
  URLs only via the lazy path; `bake:` keys are engine-needed, never materialized.

## Classification

- **blocking** — violates the checklist above; would fail review.
- **should** — best-practice gap; improves quality but not a violation.
- **nit** — style/readability preference.

## Teaching the review

For every finding, show *how you found it* (the grep, the read, the test) so
the student learns to self-review. Never fix the issues yourself unless
hands-on mode is invoked. Praise only demonstrated catches — and catch every
planted bug in a /pr-review roleplay: walk the student toward a missed one with
a targeted hint, never reveal it outright.
