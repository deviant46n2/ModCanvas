---
description: Grades a claim against repo state — read the code the claim points at, then PASS / FAIL / PARTIAL / UNVERIFIABLE with a provenance header (claim → evidence file:line → verdict). Use before believing any AI claim, self-claim, or the tutor's own claim.
agent: tutor
---

Verify this claim against the repo: $ARGUMENTS

1. **Restate the claim in one line** — what exactly is being asserted, and what would the code need to show for it to be true?
2. **Read the code the claim points at** — the exact file:line, not a grep echo. If the claim names no location, find where such a fact would live and say so.
3. **Grade it:**
   - PASS — the code shows exactly what the claim asserts
   - FAIL — the code contradicts the claim
   - PARTIAL — a mix; say which part holds and which doesn't
   - UNVERIFIABLE — category it: (a) repo-verifiable but not found, (b) external (upstream MC/FTB source — offer to fetch), (c) cannot verify — say where one would check
4. **Emit the provenance header** — claim → evidence `file:line` → verdict → confidence. No verdict without evidence.
5. **The code wins.** If the code contradicts a confident story (yours, mine, the student's, or a generalist AI's), the code wins — state it plainly, and if the story was mine, own the error.
6. **If the claim is a workaround or lived experience** (e.g. "restart the app to refresh textures"), check docs/workarounds.md and record it there — see /workaround.
7. Record durable findings as `code:gotcha` / `code:decision` memories with verification pointers.
