// integrity-suite.test.mjs — suite-self (the suite checks itself) checks.
// Run: node --test scripts/integrity-suite.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkSuiteSelf } from './integrity-suite.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'integrity-test-'))

const SUITE_RULES = {
  suiteSelf: {
    commandsDir: '.opencode/command',
    skillsDir: '.opencode/skills',
    docsFiles: ['docs/tooling.md'],
    packageJson: 'package.json',
  },
}

const suiteFixture = () => {
  const root = fixture()
  mkdirSync(join(root, '.opencode/command'), { recursive: true })
  mkdirSync(join(root, '.opencode/skills'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node x.test.mjs', integrity: 'node integrity-check.mjs', 'test:tools': 'node --test x.test.mjs' } }))
  writeFileSync(join(root, 'x.test.mjs'), '// fixture test file')
  writeFileSync(join(root, 'docs/tooling.md'), 'Run `pnpm integrity` and `pnpm test:tools`.\n')
  writeFileSync(join(root, '.opencode/command/good.md'), '---\ndescription: A good command.\nagent: tutor\n---\nLoad the tutor-observation skill.\n')
  return root
}

const withSkill = (root) => {
  mkdirSync(join(root, '.opencode/skills/tutor-observation'), { recursive: true })
  writeFileSync(join(root, '.opencode/skills/tutor-observation/SKILL.md'), '---\nname: tutor-observation\ndescription: x\n---\n')
  return root
}

test('suite-self: clean tree passes', () => {
  const { violations } = checkSuiteSelf(SUITE_RULES, withSkill(suiteFixture()))
  assert.deepEqual(violations, [])
})

test('suite-self: bad frontmatter and dead references are violations', () => {
  const root = suiteFixture()
  writeFileSync(join(root, '.opencode/command/bad.md'), '---\ndescription: missing agent\n---\nLoad the tutor-nonexistent skill.\n')
  const { violations } = checkSuiteSelf(SUITE_RULES, root)
  const msgs = violations.map((v) => v.path).join('\n')
  assert.match(msgs, /bad\.md: missing agent: tutor/)
  assert.match(msgs, /missing skill tutor-nonexistent/)
})

test('suite-self: docs mention a pnpm script that does not exist', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'Run `pnpm ghost-script`.\n')
  const { violations } = checkSuiteSelf(SUITE_RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /ghost-script/)
})

test('suite-self: PLAIN reference to a MISSING script is a candidate (F1)', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'Run pnpm ghost-script for real.\n')
  const { violations, candidates } = checkSuiteSelf(SUITE_RULES, root)
  assert.deepEqual(violations, [])
  assert.equal(candidates.length, 1)
  assert.match(candidates[0].path, /ghost-script/)
})

test('suite-self: plain reference to an EXISTING script verifies silently', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'Run pnpm integrity for real.\n')
  const { violations, candidates } = checkSuiteSelf(SUITE_RULES, root)
  assert.deepEqual(violations, [])
  assert.deepEqual(candidates, [])
})

test('suite-self: pnpm verbs in prose are not treated as scripts', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'Run pnpm install here.\n')
  const { violations } = checkSuiteSelf(SUITE_RULES, root)
  assert.deepEqual(violations, [])
})

test('suite-self: test:tools lists a missing test file', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'no pnpm here\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'test:tools': 'node --test a.test.mjs b.test.mjs' } }))
  const { violations } = checkSuiteSelf(SUITE_RULES, root)
  assert.equal(violations.length, 2) // both missing
})

test('suite-self: stale test-count claim in docs is a violation (s22 final pass)', () => {
  const root = withSkill(suiteFixture())
  writeFileSync(join(root, 'docs/tooling.md'), 'Suite has 28 tests total.\n')
  const { violations } = checkSuiteSelf(SUITE_RULES, root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /claims 28 tests/)
  assert.match(violations[0].path, /has 0 tests/)
})
