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

import { checkLineLimit, checkAssetBundle, checkStaleBinary, seedRules } from './integrity-check.mjs'
import { checkDiffHygiene, checkAdapterMatrix, checkDocSync } from './integrity-git.mjs'
import { checkDocAnchors } from './integrity-doc.mjs'

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

// --- v2: git-aware checks (real git repos in temp dirs) -------------------

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const commit = (root, msg) => git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg)

const gitFixture = () => {
  const root = fixture()
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 't')
  git(root, 'config', 'user.email', 't@t')
  return root
}

const RULES_V2 = {
  ...RULES,
  adapterDirs: ['frontend/src/adapters'],
  docSync: { codePaths: ['src'], docPaths: ['docs'], lookback: 10 },
  allowlists: { 'line-limit': [], 'asset-bundle': [], 'adapter-matrix': [] },
}

test('adapter-matrix: modifying an existing adapter is a violation', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'frontend/src/adapters/v1_20_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export {}')
  git(root, 'add', '.')
  commit(root, 'init')
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export const x = 1')
  const { violations } = checkAdapterMatrix(RULES_V2, root)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].path, 'frontend/src/adapters/v1_20_1/neoforge.ts')
})

test('adapter-matrix: adding a NEW adapter is clean; allowlisted edit is parked', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'frontend/src/adapters/v1_20_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export {}')
  git(root, 'add', '.')
  commit(root, 'init')

  // new version = new file (allowed)
  mkdirSync(join(root, 'frontend/src/adapters/v1_21_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_21_1/neoforge.ts'), 'export {}')
  let { violations } = checkAdapterMatrix(RULES_V2, root)
  assert.equal(violations.length, 0)

  // allowlisted modification = parked
  const rules = structuredClone(RULES_V2)
  rules.allowlists['adapter-matrix'].push({ path: 'frontend/src/adapters/v1_20_1/neoforge.ts', reason: 'version-boundary bug fix' })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export const x = 1')
  ;({ violations } = checkAdapterMatrix(rules, root))
  assert.equal(violations.length, 0)
})

test('doc-sync: code-only commit is a candidate; code+docs commit is not', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })

  writeFileSync(join(root, 'src', 'a.rs'), '// a')
  git(root, 'add', '.')
  commit(root, 'code only')

  writeFileSync(join(root, 'src', 'b.rs'), '// b')
  writeFileSync(join(root, 'docs', 'x.md'), '# x')
  git(root, 'add', '.')
  commit(root, 'code + docs')

  const { candidates } = checkDocSync(RULES_V2, root)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].commit.length, 7)
})

test('doc-sync: no history is info, not an error', () => {
  const root = fixture() // not a git repo
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.rs'), '// a')
  const { candidates, info } = checkDocSync(RULES_V2, root)
  assert.equal(candidates.length, 0)
  assert.equal(info.length, 1)
})

// --- v3: doc-anchors (content-level doc drift) ----------------------------

const anchorRules = (anchors) => ({ docAnchors: anchors })

const ANCHOR = {
  name: 'cache-version',
  codeFile: 'src/engine.rs',
  codePattern: /CACHE_VERSION: u32 = (\d+)/,
  docFile: 'docs/engine.md',
  docPattern: /CACHE_VERSION\s*(\d+)/g,
}

test('doc-anchors: matching code and doc is clean', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/engine.rs'), 'const CACHE_VERSION: u32 = 6;')
  writeFileSync(join(root, 'docs/engine.md'), 'The cache version is CACHE_VERSION 6.')
  const { violations, info } = checkDocAnchors(anchorRules([ANCHOR]), root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 0)
})

test('doc-anchors: stale doc mention is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/engine.rs'), 'const CACHE_VERSION: u32 = 6;')
  writeFileSync(join(root, 'docs/engine.md'), 'Older docs said CACHE_VERSION 4; the new value is CACHE_VERSION 6.')
  const { violations } = checkDocAnchors(anchorRules([ANCHOR]), root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /cache-version="4"/)
  assert.match(violations[0].path, /"6"/)
})

test('doc-anchors: doc that never mentions the anchor is info, not a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/engine.rs'), 'const CACHE_VERSION: u32 = 6;')
  writeFileSync(join(root, 'docs/engine.md'), 'no version facts here')
  const { violations, info } = checkDocAnchors(anchorRules([ANCHOR]), root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 1)
})

test('doc-anchors: missing file is info, not a crash', () => {
  const root = fixture()
  const { violations, info } = checkDocAnchors(anchorRules([ANCHOR]), root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 1)
})
