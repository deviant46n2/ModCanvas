// integrity-doc.test.mjs — doc-anchors (content-level doc drift) checks.
// Run: node --test scripts/integrity-doc.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkDocAnchors } from './integrity-doc.mjs'

const fixture = () => mkdtempSync(join(tmpdir(), 'integrity-test-'))

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

test('doc-anchors: multiple code values is a violation, not a guess (F8)', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/engine.rs'), 'const CACHE_VERSION: u32 = 6;\n#[cfg(test)] const CACHE_VERSION: u32 = 4;')
  writeFileSync(join(root, 'docs/engine.md'), 'CACHE_VERSION 6')
  const { violations } = checkDocAnchors(anchorRules([ANCHOR]), root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /multiple values/)
})

test('doc-anchors: pattern without capture group fails LOUDLY (vacuity guard)', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/engine.rs'), 'const CACHE_VERSION: u32 = 6;')
  writeFileSync(join(root, 'docs/engine.md'), 'CACHE_VERSION 6')
  const anchor = { ...ANCHOR, codePattern: /CACHE_VERSION/ } // no capture group
  const { violations } = checkDocAnchors(anchorRules([anchor]), root)
  assert.equal(violations.length, 1)
  assert.match(violations[0].path, /without a capture group/)
})

test('doc-anchors: multiline-flagged pattern keeps its /m flag (flags preserved)', () => {
  const root = fixture()
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/gradle'), "line1\nversion = '2.0.0'\n")
  writeFileSync(join(root, 'docs/readme.md'), 'jar workbench-companion-2.0.0.jar')
  const anchor = {
    name: 'jar',
    codeFile: 'src/gradle',
    codePattern: /^version\s*=\s*'([^']+)'/m,
    docFile: 'docs/readme.md',
    docPattern: /workbench-companion-([\d.]+)\.jar/g,
  }
  const { violations } = checkDocAnchors(anchorRules([anchor]), root)
  assert.deepEqual(violations, [])
})
