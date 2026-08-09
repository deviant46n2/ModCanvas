// backup-state.test.mjs — verifies the arc-data backup against fake sources
// in temp dirs (never touches the real store). Run:
//   node --test scripts/backup-state.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { audit, backup } from './backup-state.mjs'

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
