// state-freshness.test.mjs — the memory-resume-point check, tested against
// temp shard DBs + temp git repos so the real memory store is never touched.
// Run: node --test scripts/state-freshness.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { newestSession, lastCommitTs, lastCommitSha, checkFreshness } from './state-freshness.mjs'

// A temp git repo with one commit stamped at the given ISO date.
function repoCommittedAt(isoDate) {
  const dir = mkdtempSync(join(tmpdir(), 'sf-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t'], { stdio: 'ignore' })
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'], { stdio: 'ignore' })
  writeFileSync(join(dir, 'f.txt'), 'x')
  execFileSync('git', ['-C', dir, 'add', '.'], { stdio: 'ignore' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'x'], {
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
    stdio: 'ignore',
  })
  return dir
}

// A fake memory-store dir with one shard DB containing the given session rows.
function memStoreWith(shardDir, repoRoot, rows) {
  const projectsDir = join(shardDir, 'projects')
  mkdirSync(projectsDir, { recursive: true })
  const db = new DatabaseSync(join(projectsDir, 'project_test_shard_0.db'))
  db.exec('CREATE TABLE memories (content TEXT, created_at INTEGER, project_path TEXT)')
  const insert = db.prepare('INSERT INTO memories (content, created_at, project_path) VALUES (?, ?, ?)')
  for (const [content, ts, path] of rows) insert.run(content, ts, path)
  db.close()
  return { memData: shardDir }
}

test('fresh: session snapshot postdates the last commit', (t) => {
  const repo = repoCommittedAt('2026-08-01T00:00:00Z')
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'sf-mem-')), repo, [
    ['code:session sN: done', 1786262000000, repo], // 2026-08-09
  ])
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(store.memData, { recursive: true, force: true }) })

  const res = checkFreshness(store, repo)
  assert.equal(res.fresh, true)
  assert.equal(res.session.excerpt.startsWith('code:session sN'), true)
})

test('stale: resume point older than the last commit (the s22-close failure)', (t) => {
  const repo = repoCommittedAt('2026-08-09T12:00:00Z')
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'sf-mem-')), repo, [
    ['code:session sN: pre-batch', 1786060000000, repo], // 2026-08-07
  ])
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(store.memData, { recursive: true, force: true }) })

  const res = checkFreshness(store, repo)
  assert.equal(res.fresh, false)
  assert.ok(res.commitTs > res.session.ts)
})

test('no code:session entries → error, not a verdict', (t) => {
  const repo = repoCommittedAt('2026-08-01T00:00:00Z')
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'sf-mem-')), repo, [
    ['code:map something', 1786060000000, repo], // not a session entry
  ])
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(store.memData, { recursive: true, force: true }) })

  const res = checkFreshness(store, repo)
  assert.equal(res.fresh, false)
  assert.match(res.error, /no code:session/)
})

test('missing memory store → error', (t) => {
  const repo = repoCommittedAt('2026-08-01T00:00:00Z')
  t.after(() => rmSync(repo, { recursive: true, force: true }))

  const res = checkFreshness({ memData: join(tmpdir(), 'no-such-mem-dir') }, repo)
  assert.equal(res.fresh, false)
  assert.match(res.error, /no code:session/)
})

test('newestSession picks the latest row across shards', (t) => {
  const repo = repoCommittedAt('2026-08-01T00:00:00Z')
  const shardDir = mkdtempSync(join(tmpdir(), 'sf-mem-'))
  const projectsDir = join(shardDir, 'projects')
  mkdirSync(projectsDir, { recursive: true })
  for (const [name, ts] of [['a', 1786000000000], ['b', 1786200000000]]) {
    const db = new DatabaseSync(join(projectsDir, `project_${name}_shard_0.db`))
    db.exec('CREATE TABLE memories (content TEXT, created_at INTEGER, project_path TEXT)')
    db.prepare('INSERT INTO memories VALUES (?, ?, ?)').run(`code:session ${name}`, ts, repo)
    db.close()
  }
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(shardDir, { recursive: true, force: true }) })

  const s = newestSession({ memData: shardDir }, repo)
  assert.equal(s.excerpt, 'code:session b')
})

test('git helpers: lastCommitTs and lastCommitSha read the real repo', (t) => {
  const repo = repoCommittedAt('2026-08-03T04:05:06Z')
  t.after(() => rmSync(repo, { recursive: true, force: true }))

  assert.equal(lastCommitTs(repo), Date.parse('2026-08-03T04:05:06Z'))
  assert.match(lastCommitSha(repo), /^[0-9a-f]{7,}$/)
})

test('lastCommitTs on a non-git dir → null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-ng-'))
  assert.equal(lastCommitTs(dir), null)
  rmSync(dir, { recursive: true, force: true })
})
