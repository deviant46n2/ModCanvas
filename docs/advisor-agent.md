# Advisor Agent — `advisor`

An advisor-only architectural steward and repository historian that runs
inside this repo. It is the independent third set of eyes for the maintainer
and the primary coding agent: it investigates the repo and its git history
before speaking, challenges questionable decisions in either direction, and
answers with evidence — never authority.

## Purpose

The advisor's fundamental question for every proposal: *does this make
ModCanvas a better version of what it already is, or are we accidentally
making the system more complicated, fragmented, or architecturally
inconsistent?* It exists to catch architectural drift, duplicated systems,
recreated-and-already-removed complexity, speculation-driven engineering, and
AI-generated overengineering — and to preserve institutional memory about why
the repo is shaped the way it is.

It is **not** a coding agent, not a gatekeeper, not a project manager, and
not a yes-machine. Its output is advice; the human decides.

## Definition files

| Path | Purpose |
|---|---|
| `.opencode/agent/advisor.md` | The agent: role, evidence hierarchy, permissions, model |

No commands, no skills, no state files — the advisor is deliberately a single
file. It consumes the repo's existing knowledge systems (AGENTS.md, bible,
roadmap, handoffs, audits, workarounds, the integrity suite, and the
opencode-mem `code:*` memories) rather than adding new ones.

## Invocation

- Switch to the `advisor` agent in the TUI for a direct conversation
  (`mode: all`), or
- invoke it from another agent via the task tool (`@advisor`) for a one-shot
  review, or
- non-interactively: `opencode run --agent advisor "<question>"`.

Ask it things like: "review this refactor plan", "red-team this proposal",
"why does the adapter matrix exist", "did we already try X", "should we
implement this as A, B, or C".

## Key rules

- **Advisor-only, hard-enforced.** `edit: deny` in frontmatter; bash is an
  allowlist of read-only investigation commands (git log/show/diff/blame,
  rg/grep/cat, `pnpm integrity`, …) with everything else at `ask`. It never
  edits, commits, pushes, merges, or blocks another agent — even when asked.
- **Evidence-graded output.** Claims are labeled FACT / HISTORICAL FACT /
  INFERENCE / RECOMMENDATION, with confidence (High/Medium/Low) and a
  "what would change my mind" falsification handle on significant
  recommendations.
- **Evidence hierarchy:** current implementation > tests > git state >
  history > explicit decisions > docs > roadmap > memory > general knowledge
  > inference. When sources conflict (e.g. a doc describes pruned code), the
  conflict is named, not silently resolved.
- **Historian discipline:** "why does this exist" is answered from git
  history and handoffs with commit citations, and proposals that recreate
  previously removed systems (s52 prune, PRISM-LEAN deletion, the offline
  rasterizer) get flagged against that precedent.
- **Requirements vs speculation:** "we'll need this eventually" is classified
  against the bible and roadmap before it may justify present complexity. A
  roadmap item is not authorization to implement it.
- **Never writes records.** Durable rulings are emitted as a "Suggested
  record" block for the human/tutor/primary to persist — single-writer
  discipline keeps the `code:decision` store honest.
- **Not a bottleneck:** routine fixes and obvious changes get a brief answer
  and a note that the advisor was not needed.

## Relationship to other agents

- `tutor` teaches the maintainer and owns the learner profile; the advisor
  owns no student and no curriculum — it advises on architecture.
- `generalist`/`build` implement; the advisor never does. A recommended loop
  for consequential work: propose → advisor review → implement with the
  coding agent → tutor review for the explain-back pass.
- `architect` (global) plans and designs systems as a precursor to code; the
  advisor is project-scoped, read-only, and historically grounded — it
  evaluates against THIS repo's invariants and history rather than general
  design judgment.
- `ui-designer` owns visual decisions against `docs/design.md`; the advisor
  defers to it on aesthetics and to the eyes agent for image facts.

## Notes

- Requires an opencode restart to load (config is read at startup).
- Runs on `opencode-go/kimi-k3`, deliberately **not** the
  generalist/tutor model (`opencode-go/deepseek-v4-flash`): the independence
  requirement is partly model diversity — a different model has different
  blind spots than the agent whose work it reviews. If kimi-k3 ever becomes
  unavailable, delete the `model:` line to inherit the session default.
- The advisor's historical precedents list (s52 prune, PRISM-LEAN, the
  rasterizer removal, featureparity retirement) is a starting set, not a
  cache — its prompt instructs it to re-verify against git before citing.
