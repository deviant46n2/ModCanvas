// integrity-git.test.mjs — git-aware checks (diff-hygiene, adapter-matrix,
// doc-sync) against real temp git repos. Run:
//   node --test scripts/integrity-git.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkDiffHygiene, checkAdapterMatrix, checkDocSync } from './integrity-git.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'integrity-test-'))

const RULES = {
  lineLimit: 300,
  lineLimitPaths: ['src'],
  assetDirs: ['public', 'assets'],
  staleBinaries: [{ name: 'dev', path: 'bin/out', sourcePaths: ['src'] }],
  allowlists: { 'line-limit': [], 'asset-bundle': [] },
}

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

test('adapter-matrix: modifying an existing adapter is a violation', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'frontend/src/adapters/v1_20_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export {}')
  git(root, 'add', '.')
  commit(root, 'init')
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export const x = 1')
  const { violations } = checkAdapterMatrix(RULES_V2, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /modified adapter: frontend\/src\/adapters\/v1_20_1\/neoforge\.ts/)
})

test('adapter-matrix: deleting an existing adapter is a violation (F7)', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'frontend/src/adapters/v1_20_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export {}')
  git(root, 'add', '.')
  commit(root, 'init')
  execFileSync('rm', [join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts')])
  const { violations } = checkAdapterMatrix(RULES_V2, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /deleted adapter/)
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

test('adapter-matrix: accepted allowlisted edit is a decision, not debt (s47)', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'frontend/src/adapters/v1_20_1'), { recursive: true })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export {}')
  git(root, 'add', '.')
  commit(root, 'init')

  // Interface evolution: kind "accepted" lands in accepted, never violations
  // nor parked — an intentional decision with a cited reason, not debt.
  const rules = structuredClone(RULES_V2)
  rules.allowlists['adapter-matrix'].push({
    path: 'frontend/src/adapters/v1_20_1/neoforge.ts',
    reason: 'interface evolution (s47) — method added, behavior locked by matrix test, cited in docs/loot-editor.md',
    kind: 'accepted',
  })
  writeFileSync(join(root, 'frontend/src/adapters/v1_20_1/neoforge.ts'), 'export const x = 1')
  const { violations, parked, accepted } = checkAdapterMatrix(rules, root)
  assert.equal(violations.length, 0)
  assert.equal(parked.length, 0)
  assert.equal(accepted.length, 1)
  assert.match(accepted[0].path, /v1_20_1\/neoforge\.ts/)
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

test('doc-sync: a judged commit is info with its reason, not a candidate', () => {
  const root = gitFixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.rs'), '// a')
  git(root, 'add', '.')
  commit(root, 'code only')
  const hash = git(root, 'rev-parse', '--short', 'HEAD').trim()

  const withJudgment = {
    ...RULES_V2,
    docSync: { ...RULES_V2.docSync, judgments: [{ commit: hash, reason: 'pure refactor, doc-less by decision' }] },
  }
  const { candidates, info } = checkDocSync(withJudgment, root)
  assert.equal(candidates.length, 0)
  assert.equal(info.length, 1)
  assert.match(info[0].message, /pure refactor, doc-less by decision/)
})

test('doc-sync: no history is info, not an error', () => {
  const root = fixture() // not a git repo
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.rs'), '// a')
  const { candidates, info } = checkDocSync(RULES_V2, root)
  assert.equal(candidates.length, 0)
  assert.equal(info.length, 1)
})
