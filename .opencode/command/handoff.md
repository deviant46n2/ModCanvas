---
description: Emits the session state snapshot — DONE / IN-FLIGHT / PENDING (the owed view) / WHAT WE BUILT (one line, the tutor's job) / UNVERIFIED CLAIMS / DECISIONS — so a fresh session or a context compaction can resume without re-reading the chat. Write it at every boundary (session start/end, arc pivot, before compaction is likely). Enforces the compressed-handoff contract: GOTCHAS:/DECISIONS: pointers must resolve (memory-check).
agent: tutor
---

Handoff: $ARGUMENTS

Emit the session snapshot in this shape, one write to memory (`code:session`)
plus the `.tutor/profile.md` mirror:

1. **DONE** — this session, committed + uncommitted (commits with shas).
2. **IN-FLIGHT** — what is being worked, and the exact next step.
3. **PENDING (owed)** — the /owed view: pending explain-backs, parked items,
   past-due re-reviews. Never forced; list only.
4. **WHAT WE BUILT** — ONE sentence: "what we built and why." This is the
   tutor's job, not a student toll. The student may correct it or ignore it.
   Unconfirmed lines stay in the ledger as visible data (the s21 lesson:
   unowned accumulation is the cost of carrying; visible > hidden).
5. **UNVERIFIED CLAIMS** — claims made this session that lack evidence; each
   must be fed to /verify at the next session before it is relied on.
6. **DECISIONS** — ADR-lite: what + why + what was rejected (the
   `code:decision` shape), so decisions outlive the session.

**The compressed-handoff contract (s33):** the handoff is an INDEX, not an
archive. Detail belongs in tagged entries written at the moment (gotchas with
`file:line`, decisions, session chunk logs), NOT re-narrated in the handoff.
But compression is only safe if the cited detail actually exists — so every
handoff that relies on entries MUST end with reference lines, one per kind:

```
GOTCHAS: NAME_A, NAME_B
DECISIONS: NAME_C
```

The names must match the SCREAMING_CASE token in an existing `code:gotcha
NAME_A` / `code:decision NAME_C` memory. BEFORE closing the boundary: write
the referenced entries FIRST, then the handoff, then run `pnpm memory-check`
and fix anything it flags — an unresolvable reference means the compression
deleted the detail (rot). Presence is the gate's job; wrongness is the spaced
re-review's.

The snapshot must be resumable: a fresh session reading only memory + the
mirror can continue IN-FLIGHT without re-reading this chat. Keep it compact —
one breath per section.
