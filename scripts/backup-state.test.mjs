// backup-state.test.mjs — verifies the arc-data backup against fake sources
// in temp dirs (never touches the real store). Run:
//   node --test scripts/backup-state.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { audit, backup, checkpointWal } from './backup-state.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'backup-test-'))

const fakeSources = () => {
  const root = fixture()
  const tutorDir = join(root, 'repo', '.tutor')
  const memData = join(root, 'home', '.opencode-mem', 'data')
  const memConfig = join(root, 'home', '.config', 'opencode', 'opencode-mem.jsonc')
  mkdirSync(tutorDir, { recursive: true })
  mkdirSync(memData, { recursive: true })
  mkdirSync(join(memConfig, '..'), { recursive: true })
  writeFileSync(join(tutorDir, 'profile.md'), '# profile')
  writeFileSync(join(tutorDir, 'curriculum.md'), '# curriculum')
  writeFileSync(join(memData, 'user-profiles.db'), 'sqlite')
  writeFileSync(join(memData, 'user-prompts.db'), 'sqlite')
  writeFileSync(join(memData, 'metadata.db'), 'sqlite')
  writeFileSync(memConfig, '{"autoCleanupEnabled": true, "autoCleanupRetentionDays": 30, "userProfileStaleDays": 2}')
  return { tutorDir, memData, memConfig, root }
}

test('backup: archives all three sources and verifies contents', () => {
  const s = fakeSources()
  const backupDir = join(s.root, 'backups')
  const { archive, listing } = backup(s, backupDir)
  assert.ok(existsSync(archive))
  assert.ok(statSync(archive).size > 0)
  for (const entry of ['.tutor/profile.md', '.tutor/curriculum.md', '.opencode-mem/data/user-profiles.db', '.config/opencode/opencode-mem.jsonc']) {
    assert.ok(listing.includes(entry), `archive missing ${entry}`)
  }
  assert.ok(existsSync(archive.replace(/\.tar\.gz$/, '.manifest.txt')))
})

test('backup: rotation keeps only the newest KEEP archives', () => {
  const s = fakeSources()
  const backupDir = join(s.root, 'backups')
  // pre-create 6 old archives (empty files are fine — rotation only reads names)
  mkdirSync(backupDir, { recursive: true })
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(backupDir, `tutor-state-2026-08-0${i}T00-00-0${i}.tar.gz`), '')
  }
  const { archive } = backup(s, backupDir)
  const archives = readdirSync(backupDir).filter((f) => f.endsWith('.tar.gz'))
  assert.equal(archives.length, 5) // 6 old + 1 new, minus 2 rotated out
  assert.ok(archives.includes(archive.split('/').pop()))
})

test('backup: no sources present throws', () => {
  const s = { tutorDir: '/nonexistent/t', memData: '/nonexistent/m', memConfig: '/nonexistent/c' }
  assert.throws(() => backup(s, join(fixture(), 'b')), /nothing to back up/)
})

test('audit: flags expiry risk and missing sources', () => {
  const s = fakeSources()
  const findings = audit(s)
  const warns = findings.filter((f) => f.severity === 'warn')
  assert.ok(warns.some((w) => /retention=30d/.test(w.message)))
  assert.ok(warns.some((w) => /staleProfile=2d/.test(w.message)))

  const bad = audit({ tutorDir: '/nope', memData: '/nope', memConfig: '/nope' })
  assert.equal(bad.filter((f) => f.severity === 'error').length, 3)
})

test('backup: two rapid stamps never collide (F5 ms precision)', () => {
  // stamp() is not exported; prove it via two immediate backups to the same dir
  const s = fakeSources()
  const backupDir = join(s.root, 'backups')
  const a = backup(s, backupDir)
  const b = backup(s, backupDir)
  assert.notEqual(a.archive, b.archive)
  assert.ok(existsSync(a.archive) && existsSync(b.archive))
})

test('checkpointWal: folds a live WAL into the main db', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wal-test-'))
  const dbPath = join(dir, 'shard.db')
  // The producer (the opencode-mem plugin) holds the db open with rows in
  // the WAL; close() would auto-checkpoint, so keep this connection live.
  const producer = new DatabaseSync(dbPath)
  producer.exec('PRAGMA journal_mode = WAL')
  producer.exec('CREATE TABLE t (v TEXT)')
  producer.exec('INSERT INTO t VALUES (\'hello\')')
  const walPath = dbPath + '-wal'
  assert.ok(existsSync(walPath) && statSync(walPath).size > 0, 'WAL file should hold the uncheckpointed write')

  // The backup script is a separate process — checkpoint from a new connection
  const res = checkpointWal(dir)
  assert.equal(res.checked, 1)
  assert.equal(res.skipped, 0)

  // TRUNCATE empties the -wal: the archive captures one consistent state
  assert.ok(!existsSync(walPath) || statSync(walPath).size === 0, 'WAL should be truncated after checkpoint')
  producer.close()
})

test('checkpointWal: skips non-db files and unopenable dbs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wal-skip-'))
  writeFileSync(join(dir, 'not-a-db.txt'), 'text')
  writeFileSync(join(dir, 'corrupt.db'), 'not sqlite')
  mkdirSync(join(dir, 'nested'))
  writeFileSync(join(dir, 'nested', 'other.txt'), 'x')
  const res = checkpointWal(dir)
  assert.equal(res.checked, 0)
  assert.equal(res.skipped, 1) // corrupt.db fails to open; txt files ignored
})

test('checkpointWal: missing dir is a no-op, never throws', () => {
  const res = checkpointWal('/nonexistent/nowhere')
  assert.deepEqual(res, { checked: 0, skipped: 0 })
})
