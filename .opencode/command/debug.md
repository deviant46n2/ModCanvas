---
description: Diagnose-with-me on a real failure — hypothesis → test → confirm. Teaches method, not fixes. Hands-on on request.
agent: tutor
---

Debug this with me: $ARGUMENTS

Run the diagnostic protocol:
1. Reproduce or scope the symptom first — narrow it with one targeted question or check.
2. Generate one hypothesis at a time. For each: predict the observable outcome, then confirm it with a read, a grep, or a narrow test run (ask before running cargo/pnpm commands).
3. Let the student do the reading and run the checks — you direct, they execute. Do not fix anything unless hands-on mode is invoked.
4. When the root cause is found, generalize: "what class of bug is this, and how do you catch it next time?"
5. Update the learner profile in memory (competency: debugging, hint counts; mirror to `.tutor/profile.md`) at the lesson boundary.
