// integrity-extras.test.mjs — build-smoke, report() candidate formatting, and
// the accepted-category checks. Split from integrity-check.test.mjs when the
// suite's own test file tripped its 300-line rule (s36 — the meta-rule
// applied to the tooling itself).
// Run: node --test scripts/integrity-extras.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkLineLimit, checkAssetBundle, formatCandidate } from './integrity-check.mjs'
import { checkBuildSmoke } from './integrity-build.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'integrity-test-'))

const RULES = {
  lineLimit: 300,
  lineLimitPaths: ['src'],
  assetDirs: ['public', 'assets'],
  allowlists: { 'line-limit': [], 'asset-bundle': [] },
}

const nLines = (n) => 'x\n'.repeat(n)

// --- build-smoke (integrity-build.mjs) ------------------------------------

function buildFixture(script) {
  const root = fixture()
  mkdirSync(join(root, 'frontend'), { recursive: true })
  writeFileSync(
    join(root, 'frontend', 'package.json'),
    JSON.stringify({ scripts: { build: script } }),
  )
  mkdirSync(join(root, 'frontend', 'node_modules'), { recursive: true })
  return root
}

test('build-smoke: passing build is clean', () => {
  const root = buildFixture('node -e "process.exit(0)"')
  const { violations } = checkBuildSmoke(RULES, root)
  assert.equal(violations.length, 0)
})

test('build-smoke: failing build is a violation with output', () => {
  const root = buildFixture('node -e "process.stderr.write(\\"broken import\\"); process.exit(1)"')
  const { violations } = checkBuildSmoke(RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].message, /broken import/)
})

test('build-smoke: missing build script is a violation', () => {
  const root = fixture()
  mkdirSync(join(root, 'frontend'), { recursive: true })
  writeFileSync(join(root, 'frontend', 'package.json'), JSON.stringify({ scripts: {} }))
  const { violations } = checkBuildSmoke(RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].message, /build.*script/i)
})

test('build-smoke: missing node_modules is a violation, not a blind build', () => {
  const root = fixture()
  mkdirSync(join(root, 'frontend'), { recursive: true })
  writeFileSync(join(root, 'frontend', 'package.json'), JSON.stringify({ scripts: { build: 'node -e "process.exit(0)"' } }))
  const { violations } = checkBuildSmoke(RULES, root)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].path, 'frontend/node_modules')
})

test('build-smoke: rules.buildSmoke.skip turns the section into info', () => {
  const root = buildFixture('node -e "process.exit(1)"')
  const rules = structuredClone(RULES)
  rules.buildSmoke = { skip: true }
  const { violations, info } = checkBuildSmoke(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(info.length, 1)
})

// --- report() candidate formatting ----------------------------------------

test('formatCandidate: doc-sync candidate renders commit + files', () => {
  assert.equal(
    formatCandidate({ commit: 'abc123', files: ['src/a.rs'] }),
    'commit abc123 changed code without docs: src/a.rs',
  )
})

test('formatCandidate: path-shaped candidate (suite-self) renders its path, not "commit undefined" (s34)', () => {
  assert.equal(
    formatCandidate({ path: 'docs/x.md: plain pnpm reference "foo"' }),
    'docs/x.md: plain pnpm reference "foo"',
  )
})

test('formatCandidate: message-only candidate falls back to the message', () => {
  assert.equal(formatCandidate({ message: 'something needs judgment' }), 'something needs judgment')
})

// --- accepted category (intentional decisions, s36) ------------------------

test('line-limit: kind-accepted entry reports as accepted, not parked', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'big.rs'), nLines(301))
  const rules = structuredClone(RULES)
  rules.allowlists['line-limit'].push({ path: 'src/big.rs', reason: 'intentional — see AGENTS.md', kind: 'accepted' })
  const { violations, parked, accepted } = checkLineLimit(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(parked.length, 0)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].path, 'src/big.rs')
})

test('asset-bundle: kind-accepted entry reports as accepted, not parked', () => {
  const root = fixture()
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'assets', 'hero.png'), 'branding bytes')
  const rules = structuredClone(RULES)
  rules.allowlists['asset-bundle'].push({ path: 'assets/hero.png', reason: 'branding — AGENTS.md permits', kind: 'accepted' })
  const { violations, parked, accepted } = checkAssetBundle(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(parked.length, 0)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].path, 'assets/hero.png')
})
