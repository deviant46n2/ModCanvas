#!/usr/bin/env node
// state-freshness.mjs — is the memory resume point newer than the last commit?
// The s22-close failure class: the profile mirror was updated but the code:session
// handoff write was skipped — memory told a stale story (a fresh session would have
// believed the tooling arc never happened). This check makes that class mechanical:
// the newest code:session snapshot must postdate the last commit.
//
// Usage (run from the repo root):
//   node scripts/state-freshness.mjs            # check + report
//   node scripts/state-freshness.mjs --quiet    # machine-readable: fresh|stale|error
// Tests: node --test scripts/state-freshness.test.mjs
//
// Exit codes: 0 fresh, 1 stale (resume point older than last commit), 2 error.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const ROOT = process.cwd()
const DEFAULT_SOURCES = {
  memData: join(process.env.HOME ?? '/home/deviant', '.opencode-mem', 'data'),
}

// Newest code:session entry (created_at ms + first-line excerpt) for the repo,
// or null when the memory store has no session entries for it at all.
export function newestSession(sources, repoRoot = ROOT) {
  const projectsDir = join(sources.memData, 'projects')
  if (!existsSync(projectsDir)) return null

  let newest = null
  for (const f of readdirSync(projectsDir)) {
    if (!f.endsWith('.db')) continue
    try {
      const db = new DatabaseSync(join(projectsDir, f))
      const row = db
        .prepare(
          `SELECT MAX(created_at) AS ts, content FROM memories
           WHERE project_path = ? AND content LIKE 'code:session%'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(repoRoot)
      db.close()
      if (row && row.ts !== null && (newest === null || row.ts > newest.ts)) {
        newest = { ts: row.ts, excerpt: String(row.content).split('\n')[0].slice(0, 100) }
      }
    } catch {
      // a shard that cannot open is not this check's concern — skip it
    }
  }
  return newest
}

// Last commit time in ms for the repo, or null when git is unavailable.
export function lastCommitTs(repoRoot = ROOT) {
  try {
    const secs = Number(
      execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    )
    return Number.isFinite(secs) ? secs * 1000 : null
  } catch {
    return null
  }
}

export function lastCommitSha(repoRoot = ROOT) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function checkFreshness(sources, repoRoot = ROOT) {
  const session = newestSession(sources, repoRoot)
  if (!session) return { fresh: false, error: 'no code:session entries found for this repo' }
  const commitTs = lastCommitTs(repoRoot)
  if (commitTs === null) return { fresh: false, error: 'could not read last commit time' }
  return { fresh: session.ts >= commitTs, session, commitTs }
}

function main() {
  const res = checkFreshness(DEFAULT_SOURCES)
  const quiet = process.argv.includes('--quiet')

  if (res.error) {
    if (quiet) return console.log('error')
    console.error(`[ERROR] ${res.error}`)
    process.exit(2)
  }

  const sessionDate = new Date(res.session.ts).toISOString()
  const commitDate = new Date(res.commitTs).toISOString()
  const sha = lastCommitSha()

  if (res.fresh) {
    if (quiet) return console.log('fresh')
    console.log(`[INFO] resume point is fresh: code:session ${sessionDate} >= last commit ${commitDate} (${sha})`)
    console.log(`[INFO] newest session: ${res.session.excerpt}`)
    return
  }

  if (quiet) return console.log('stale')
  console.error(`[ERROR] STALE resume point — the session that committed ${sha} (${commitDate}) never wrote its close handoff`)
  console.error(`        newest code:session is ${sessionDate}: ${res.session.excerpt}`)
  console.error(`        remedy: write the missing code:session snapshot (the /handoff shape) — the s22-close failure class`)
  process.exit(1)
}

if (process.argv[1] && process.argv[1].endsWith('state-freshness.mjs')) {
  main()
}
