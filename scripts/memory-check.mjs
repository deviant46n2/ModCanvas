#!/usr/bin/env node
// memory-check.mjs — handoff references must resolve (the s33 anti-rot gate).
// The compressed-handoff contract: a code:session snapshot may shrink detail
// to pointers ("GOTCHAS: A, B" / "DECISIONS: C"), but every name it cites must
// exist as a memory with the matching code:gotcha / code:decision prefix. An
// unresolvable reference means the compression deleted the detail — the same
// claim-vs-record mismatch the doc-sync gate catches at the repo level,
// transplanted to the memory store. Presence only; wrong/vague entries are the
// spaced re-reviews' job.
//
// Usage (run from the repo root):
//   node scripts/memory-check.mjs            # check + report
//   node scripts/memory-check.mjs --quiet    # machine-readable: clean|violations|error
// Tests: node --test scripts/memory-check.test.mjs
//
// Exit codes: 0 clean, 1 violations (references without records), 2 error.

import { existsSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const DEFAULT_SOURCES = {
  memData: join(process.env.HOME ?? '/home/deviant', '.opencode-mem', 'data'),
}

// All memory rows across every project shard, or null when the store is gone.
// An unopenable shard is skipped — not this check's concern (same rule as
// state-freshness).
export function loadMemories(sources) {
  const projectsDir = join(sources.memData, 'projects')
  if (!existsSync(projectsDir)) return null
  const memories = []
  for (const f of readdirSync(projectsDir)) {
    if (!f.endsWith('.db')) continue
    try {
      const db = new DatabaseSync(join(projectsDir, f), { readOnly: true })
      memories.push(...db.prepare('SELECT id, content FROM memories').all())
      db.close()
    } catch {
      // skip
    }
  }
  return memories
}

// Reference lines from a handoff: "GOTCHAS: A, B" / "DECISIONS: C".
export function parseReferences(content) {
  const out = []
  for (const kind of ['GOTCHAS', 'DECISIONS']) {
    const m = content.match(new RegExp(`^${kind}:\\s*(.+)$`, 'm'))
    if (!m) continue
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean)
    if (names.length) out.push({ kind, names })
  }
  return out
}

// Entries that can satisfy a reference: the first two tokens of any memory
// ("code:gotcha NAME", "code:decision NAME" — the SCREAMING_CASE convention).
function presentEntries(memories) {
  const present = new Set()
  for (const m of memories) {
    const mm = m.content.match(/^(code:(?:gotcha|decision))\s+([A-Z0-9][A-Z0-9_-]*)/)
    if (mm) present.add(`${mm[1]} ${mm[2]}`)
  }
  return present
}

export function checkMemories(sources) {
  const memories = loadMemories(sources)
  if (memories === null) return { ok: false, error: 'memory store missing', violations: [] }
  const present = presentEntries(memories)
  const violations = []
  let sessionsScanned = 0
  for (const m of memories) {
    if (!m.content.startsWith('code:session')) continue
    sessionsScanned++
    for (const { kind, names } of parseReferences(m.content)) {
      const prefix = kind === 'GOTCHAS' ? 'code:gotcha' : 'code:decision'
      for (const name of names) {
        if (!present.has(`${prefix} ${name}`)) violations.push({ session: m.id, kind, name })
      }
    }
  }
  return { ok: violations.length === 0, sessionsScanned, violations }
}

function main() {
  const res = checkMemories(DEFAULT_SOURCES)
  const quiet = process.argv.includes('--quiet')
  if (res.error) {
    if (quiet) return console.log('error')
    console.error(`[ERROR] ${res.error}`)
    process.exit(2)
  }
  if (res.ok) {
    if (quiet) return console.log('clean')
    console.log(`[INFO] memory-check clean: ${res.sessionsScanned} session(s), all references resolve`)
    return
  }
  if (quiet) return console.log('violations')
  console.error(`[ERROR] memory-check VIOLATIONS — handoffs cite detail that doesn't exist:`)
  for (const v of res.violations) {
    console.error(`  ${v.kind} ${v.name} — referenced by session ${v.session}`)
  }
  console.error('        remedy: write the missing code:gotcha / code:decision entry, then re-run')
  process.exit(1)
}

if (process.argv[1] && process.argv[1].endsWith('memory-check.mjs')) {
  main()
}
