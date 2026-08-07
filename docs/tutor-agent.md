# Tutor Agent — `tutor`

A maintainer tutor that runs inside this repo. Teaches the student (the repo's
maintainer) software engineering fundamentals, standards, best practices, and
architecture — always through ModCanvas — with the end goal of maintaining this
project with little to no AI help.

## Purpose

The tutor is a **teacher, not a coding agent**. Its north star is the student's
decreasing dependence on it. It explains, traces, quizzes, and reviews; it only
writes code when the student explicitly invokes the hands-on escape hatch.

## Definition files

| Path | Purpose |
|---|---|
| `.opencode/agent/tutor.md` | The agent: persona, permissions, model |
| `.opencode/command/*.md` | Commands: `/explain /teach /orient /trace /quiz /review /pr-review /debug` |
| `.opencode/skills/tutor-{socratic,trace,review}/` | Teaching protocols |
| `.tutor/curriculum.md` | Private master plan: 5 phases + Foundational Concepts Index |
| `.tutor/profile.md` | Human-readable mirror of the learner profile |

The **source of truth** for the adaptive learner profile is the **opencode-mem
`profile` slot** (project scope), supplemented by tagged memories
(`tutor:concept:<name>`, `tutor:session`, `tutor:insight`). The tutor reads
memory at session start and writes it at every lesson boundary; `.tutor/profile.md`
is updated in the same pass so the student can read their own progress.
`.tutor/` is gitignored — it holds private learning state only.

## Invocation

- Switch to the `tutor` agent in the TUI, or use the slash commands above.
- At session start the tutor reads the profile + curriculum, scans recent git
  activity, and opens with a teaching hook based on what was touched.

## Key rules

- **Teach, don't do.** Code is never written or fixed unless the student says
  "hands-on" / "just fix it" — then the tutor narrates and asks for an
  explain-back.
- **Grounded:** every claim cited to `file:line`; unverifiable claims labeled as
  such (external = upstream FTB-Quests/Minecraft docs, opt-in).
- **Adaptive:** Explain → Generalize → Probe → Confirm, escalating from concrete
  to abstract as understanding is shown.
- **Fading:** per-competency support levels `guided → prompted → verify-only →
  independent`, hint counts tracked downward toward the independence exam.

## Relationship to other agents

`generalist`/`build` do the actual engineering; the tutor teaches. A recommended
loop: teach → implement (with generalist) → review (with tutor) → the tutor
forces the "explain it back" pass on anything AI produced.

## Notes

- Requires an opencode restart to load the new agent/commands (config is read at
  startup).
- The tutor runs on the same model as the generalist agent
  (`opencode-go/deepseek-v4-flash`); its accuracy comes from grounding
  discipline (read-before-teach, code-verifiable grading), not model size.
