---
description: Adaptive quiz — code-verifiable questions you can grade by reading the repo. Never false-negative; includes a "disagree" escape hatch.
agent: tutor
---

Quiz me: $ARGUMENTS

Run a quiz:
1. Pick 3–5 questions. Topics: the requested topic if given, otherwise past-due concepts from the learner profile in memory (next_review dates) + one fresh concept from the Foundational Concepts Index.
2. Every question must be **code-verifiable** — you can grade the answer by reading the repo — and **un-guessable**: not answerable by recalling material, comments, or excerpts just shown. If the answer sits in what the student just read, the question tests recall, not understanding.
3. Grade each answer against the actual code before declaring right/wrong. If an answer is correct but surprising, say so and explain.
4. State your own certainty honestly. If you can't grade it confidently, say "I can't verify that" rather than guessing.
5. **Graded gates:** a wrong or half answer does not advance the concept — re-teach it differently and retake; record it as not-owned (level un-promoted) until it passes. The student's self-report weighs in: fuzzy or lost = not owned.
6. After grading, update the learner profile in memory (rewrite the `tutor:profile` tagged memory with the full current profile — the `profile` tool cannot overwrite its description anchor, s69 protocol fix; mirror to `.tutor/profile.md`): accuracy per concept, level changes (sustained accuracy + self-assessment required), next_review dates.
7. Always add: "If you disagree with any grade, say so and I'll re-evaluate against the code."
