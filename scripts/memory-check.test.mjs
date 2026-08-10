// memory-check.test.mjs — the handoff-reference gate, tested against temp
// shard DBs so the real memory store is never touched. The s33 contract: a
// code:session may compress detail to GOTCHAS:/DECISIONS: pointers, but every
// cited name must resolve to an existing entry. Run:
//   node --test scripts/memory-check.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMemories, parseReferences, checkMemories } from './memory-check.mjs'

// A fake memory store: one shard DB holding the given [id, content] rows.
function memStoreWith(shardDir, rows) {
  const projectsDir = join(shardDir, 'projects')
  mkdirSync(projectsDir, { recursive: true })
  const db = new DatabaseSync(join(projectsDir, 'project_test_shard_0.db'))
  db.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)')
  const insert = db.prepare('INSERT INTO memories (id, content) VALUES (?, ?)')
  for (const [id, content] of rows) insert.run(id, content)
  db.close()
  return { memData: shardDir }
}

const cleanup = (t, ...dirs) => t.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

test('clean: every GOTCHAS/DECISIONS reference resolves to an entry', (t) => {
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'mc-')), [
    ['s1', 'code:session s33 close\nGOTCHAS: STALE-PROCESS-VS-STALE-BINARY\nDECISIONS: PROGRESSION-TAB-KILL'],
    ['g1', 'code:gotcha STALE-PROCESS-VS-STALE-BINARY (2026-08-10): the binary file can be current...'],
    ['d1', 'code:decision PROGRESSION-TAB-KILL (2026-08-10): kill the editable tab...'],
  ])
  cleanup(t, store.memData)

  const res = checkMemories(store)
  assert.equal(res.ok, true)
  assert.equal(res.sessionsScanned, 1)
  assert.equal(res.violations.length, 0)
})

test('violation: handoff cites a gotcha that does not exist (the rot case)', (t) => {
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'mc-')), [
    ['s1', 'code:session s33 close\nGOTCHAS: EMPTY-QUERY-GUARD'],
  ])
  cleanup(t, store.memData)

  const res = checkMemories(store)
  assert.equal(res.ok, false)
  assert.equal(res.violations.length, 1)
  assert.equal(res.violations[0].name, 'EMPTY-QUERY-GUARD')
  assert.equal(res.violations[0].kind, 'GOTCHAS')
})

test('violation: DECISIONS reference missing too', (t) => {
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'mc-')), [
    ['s1', 'code:session s33\nDECISIONS: NO-SUCH-DECISION'],
  ])
  cleanup(t, store.memData)

  const res = checkMemories(store)
  assert.equal(res.ok, false)
  assert.equal(res.violations[0].kind, 'DECISIONS')
})

test('sessions without reference lines are fine (pre-convention handoffs)', (t) => {
  const store = memStoreWith(mkdtempSync(join(tmpdir(), 'mc-')), [
    ['s1', 'code:session s32 close: no pointer lines yet'],
    ['g1', 'code:gotcha SOMETHING (2026-08-09): unrelated'],
  ])
  cleanup(t, store.memData)

  const res = checkMemories(store)
  assert.equal(res.ok, true)
  assert.equal(res.sessionsScanned, 1)
})

test('references resolve across shards', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  const projectsDir = join(dir, 'projects')
  mkdirSync(projectsDir, { recursive: true })
  const dbA = new DatabaseSync(join(projectsDir, 'project_a_shard_0.db'))
  dbA.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)')
  dbA.prepare('INSERT INTO memories VALUES (?, ?)').run('s1', 'code:session s33\nGOTCHAS: CROSS-SHARD-CATCH')
  dbA.close()
  const dbB = new DatabaseSync(join(projectsDir, 'project_b_shard_0.db'))
  dbB.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)')
  dbB.prepare('INSERT INTO memories VALUES (?, ?)').run('g1', 'code:gotcha CROSS-SHARD-CATCH (2026-08-10): lived elsewhere')
  dbB.close()
  cleanup(t, dir)

  const res = checkMemories({ memData: dir })
  assert.equal(res.ok, true)
})

test('missing memory store → error, not a verdict', () => {
  const res = checkMemories({ memData: join(tmpdir(), 'no-such-mem-dir') })
  assert.equal(res.ok, false)
  assert.match(res.error, /missing/)
})

test('parseReferences: comma-separated names, kind-tagged', () => {
  const refs = parseReferences('code:session x\nGOTCHAS: A, B , C\nDECISIONS: D')
  assert.deepEqual(refs, [
    { kind: 'GOTCHAS', names: ['A', 'B', 'C'] },
    { kind: 'DECISIONS', names: ['D'] },
  ])
})

test('parseReferences: no lines → nothing', () => {
  assert.deepEqual(parseReferences('code:session plain'), [])
})

test('loadMemories: empty store dir → empty list, not null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  mkdirSync(join(dir, 'projects'), { recursive: true })
  const res = loadMemories({ memData: dir })
  assert.deepEqual(res, [])
  rmSync(dir, { recursive: true, force: true })
})
