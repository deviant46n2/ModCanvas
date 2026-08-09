// integrity-check.test.mjs — verifies the engine's checks against fixture
// trees (temp dirs), so each check is proven to fire AND to clear.
//
// Run: node --test scripts/integrity-check.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkLineLimit, checkAssetBundle, checkStaleBinary, checkDiffHygiene, seedRules } from './integrity-check.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'integrity-test-'))

const nLines = (n) => 'x\n'.repeat(n)

const RULES = {
  lineLimit: 300,
  lineLimitPaths: ['src'],
  assetDirs: ['public', 'assets'],
  binaryPath: 'bin/out',
  sourcePaths: ['src'],
  allowlists: { 'line-limit': [], 'asset-bundle': [] },
}

test('line-limit: over-limit file is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'big.rs'), nLines(301))
  const { violations, parked } = checkLineLimit(RULES, root)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].path, 'src/big.rs')
  assert.equal(violations[0].lines, 301)
  assert.equal(parked.length, 0)
})

test('line-limit: allowlisted over-limit file is parked, not a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'big.rs'), nLines(301))
  const rules = structuredClone(RULES)
  rules.allowlists['line-limit'].push({ path: 'src/big.rs', reason: 'known debt' })
  const { violations, parked } = checkLineLimit(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(parked.length, 1)
  assert.equal(parked[0].reason, 'known debt')
})

test('line-limit: at-limit file is clean', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'ok.rs'), nLines(300))
  const { violations } = checkLineLimit(RULES, root)
  assert.equal(violations.length, 0)
})

test('line-limit: missing directory is skipped', () => {
  const root = fixture()
  const { violations } = checkLineLimit(RULES, root) // no src/ exists
  assert.equal(violations.length, 0)
})

test('asset-bundle: un-allowlisted raster image is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'public'), { recursive: true })
  writeFileSync(join(root, 'public', 'stolen.png'), 'fake bytes')
  const { violations } = checkAssetBundle(RULES, root)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].path, 'public/stolen.png')
})

test('asset-bundle: allowlisted asset is parked; svg is not flagged', () => {
  const root = fixture()
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'assets', 'hero.png'), 'fake bytes')
  writeFileSync(join(root, 'assets', 'icons.svg'), '<svg/>')
  const rules = structuredClone(RULES)
  rules.allowlists['asset-bundle'].push({ path: 'assets/hero.png', reason: 'self-authored' })
  const { violations, parked } = checkAssetBundle(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(parked.length, 1)
  assert.equal(parked[0].reason, 'self-authored')
})

test('asset-bundle: image referenced in tauri bundle.resources is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src-tauri'), { recursive: true })
  writeFileSync(
    join(root, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({ bundle: { resources: ['../frontend/public/stolen.png', '../frontend/dist/bundle.js'] } }),
  )
  const { violations } = checkAssetBundle(RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /stolen\.png/)
})

test('stale-binary: binary older than newest source is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'bin', 'out'), 'bin')
  writeFileSync(join(root, 'src', 'new.rs'), '// newer')
  // Timestamps can share a tick; make the binary deterministically older.
  const past = new Date(Date.now() - 60_000)
  utimesSync(join(root, 'bin', 'out'), past, past)
  const { violations, info } = checkStaleBinary(RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].message, /STALE/)
  assert.equal(info.length, 0)
})

test('stale-binary: binary newer than all sources is clean', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'bin', 'out'), 'bin')
  writeFileSync(join(root, 'src', 'old.rs'), '// old')
  const past = new Date(Date.now() - 60_000)
  utimesSync(join(root, 'src', 'old.rs'), past, past)
  const { violations, info } = checkStaleBinary(RULES, root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 1)
})

test('stale-binary: no binary is info, not a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.rs'), '// a')
  const { violations, info } = checkStaleBinary(RULES, root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 1)
})

test('diff-hygiene: trailing whitespace in staged diff is a violation, then clears', () => {
  const root = fixture()
  execFileSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'bad.txt'), 'hello \n')
  execFileSync('git', ['add', 'bad.txt'], { cwd: root })
  let { violations } = checkDiffHygiene(RULES, root)
  assert.equal(violations.length, 1)

  writeFileSync(join(root, 'bad.txt'), 'hello\n')
  execFileSync('git', ['add', 'bad.txt'], { cwd: root })
  ;({ violations } = checkDiffHygiene(RULES, root))
  assert.equal(violations.length, 0)
})

test('seedRules: parks violations and preserves existing entries', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'public'), { recursive: true })
  writeFileSync(join(root, 'src', 'big.rs'), nLines(301))
  writeFileSync(join(root, 'public', 'x.png'), 'fake')
  const rulesPath = join(root, 'rules.json')
  const rules = structuredClone(RULES)
  rules.allowlists['line-limit'].push({ path: 'src/keep.rs', reason: 'hand-written' })
  const seeded = seedRules(rulesPath, rules, root)
  assert.ok(seeded.allowlists['line-limit'].some((a) => a.path === 'src/keep.rs'))
  assert.ok(seeded.allowlists['line-limit'].some((a) => a.path === 'src/big.rs'))
  assert.ok(seeded.allowlists['asset-bundle'].some((a) => a.path === 'public/x.png'))
  assert.ok(existsSync(rulesPath))
})
