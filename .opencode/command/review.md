---
description: Reviews the student's recent code (git diff) as a strict maintainer, teaching self-review against the repo's own standards.
agent: tutor
---

Review my recent work as a strict maintainer: $ARGUMENTS

Run the review protocol:
1. Inspect the recent diff (git diff / git log since the last session, or the files the student names).
2. Review against the repo's own rubric — the standards in AGENTS.md and the tutor-review skill: 3-layer rule, 300-line limit, adapter matrix discipline, no asset bundling, doc-sync, version boundaries, comment preservation, path safety.
3. For each finding, classify: blocking (must fix), should (best practice), nit (style). Explain *why* in terms the student can generalize.
4. Teach self-review: after your findings, show how you found them so the student can do it themselves next time.
5. Do NOT fix the issues unless the student invokes hands-on mode.
6. Update the learner profile in memory (competency: review/self-review, hint counts; mirror to `.tutor/profile.md`) at the lesson boundary.
