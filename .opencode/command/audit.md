---
description: Self-audit of the tutor's own config — every command/skill reference resolves, the profile mirror matches memory, no stale contracts (the s13 failure happened twice). Findings classified blocking/should/nit. Run at session start or before trusting the tutor's own instructions.
agent: tutor
---

Audit: $ARGUMENTS

Verify the tutor's own configuration against the repo and itself:

1. **Reference resolution** — every file/section/row a command or skill
   references EXISTS:
   - sections named in `.opencode/command/*.md` exist in
     `scripts/integrity-check.mjs`;
   - rows cited in `docs/workarounds.md` are present;
   - anchors named in `scripts/integrity-rules.mjs` (the `docAnchors` defaults —
     the on-disk `integrity-rules.json` overlay may add more) exist;
   - scripts referenced by `package.json` exist on disk.
2. **Contract sync** — AGENTS.md (the student's contract) vs the tutor config
   and the learner profile agree: goals, phase, support levels. A stale goal
   contract surviving in config is the s13 failure — check the dates.
3. **Mirror vs memory** — `.tutor/profile.md` matches the newest `tutor:profile`
   tagged memory (the canonical profile since the s69 protocol fix). The
   `profile` tool's description anchor is append-only and CANNOT be overwritten
   — its staleness is a known structural limit, not a finding. Flag drift
   between the mirror and the tagged memory.
4. **Frontmatter honesty** — every command/skill `description` matches what
   the file actually instructs (a stale description misleads the next agent).
5. **State freshness** — `node scripts/state-freshness.mjs`: the newest
   `code:session` entry in memory must postdate the last commit. A stale
   resume point is the s22-close failure (profile mirror written, handoff
   write skipped — memory told a stale story). Exit 1 means the session that
   committed the latest work never wrote its close snapshot; remedy is the
   /handoff write, not an edit to this audit.

Classify findings: **blocking** (would misdirect a session), **should**
(hygiene), **nit** (style). Fix nothing without hands-on — the student owns
the decisions; you surface them. A clean audit on the current tree = 0
blocking.
