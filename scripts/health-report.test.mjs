// health-report.test.mjs — the repo health thermometer's contracts.
//   score math (weights per class), ranking order, trend append semantics.
// Run: node --test scripts/health-report.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeScore, rankWork, loadTrend, appendTrend, parkedWeightFor } from './health-report.mjs'

const ROOT = process.cwd()

const RESULTS = [
  {
    name: 'line-limit',
    violations: [{ path: 'src-tauri/src/new_big.rs' }],
    candidates: [],
    parked: [],
  },
  {
    name: 'doc-sync',
    violations: [],
    candidates: [{ path: 'commit abc123 changed code without docs' }],
    parked: [],
  },
  {
    name: 'asset-bundle',
    violations: [],
    candidates: [],
    parked: [{ path: 'frontend/src/assets/hero.png', reason: 'permitted branding' }],
  },
  {
    name: 'stale-binary',
    violations: [],
    candidates: [],
    parked: [
      { path: 'README.md', reason: 'parked - revisit on next touching change', since: '2026-01-01T00:00:00' },
    ],
  },
  {
    name: 'adapter-matrix',
    violations: [],
    candidates: [],
    parked: [],
  },
  {
    name: 'doc-anchors',
    violations: [],
    candidates: [],
    parked: [],
  },
  {
    name: 'suite-self',
    violations: [],
    candidates: [],
    parked: [],
  },
  {
    name: 'diff-hygiene',
    violations: [],
    candidates: [],
    parked: [],
  },
]

test('computeScore: 100 for a clean ledger', () => {
  const { score, deduction } = computeScore([], { weights: {}, ledger: [] })
  assert.equal(score, 100)
  assert.equal(deduction, 0)
})

test('computeScore: violation full, candidate partial, parked near-zero', () => {
  const { score } = computeScore(RESULTS, { weights: {}, ledger: [] })
  // 1 violation (10) + 1 candidate (3) + 2 parked (2 * 0.5 = 1)
  assert.equal(score, 100 - 10 - 3 - 1)
})

test('computeScore: ledger items deduct by explicit priority', () => {
  const health = { weights: {}, ledger: [{ id: 'a', priority: 'P1' }, { id: 'b', priority: 'P3' }] }
  const { score } = computeScore([], health)
  assert.equal(score, 100 - 10 - 2)
})

test('computeScore: floors at 0, never negative', () => {
  const health = { weights: { violation: 10 }, ledger: [] }
  const results = [
    { name: 'line-limit', violations: [{ path: 'a' }, { path: 'b' }, { path: 'c' }], candidates: [], parked: [] },
    { name: 'doc-sync', violations: [{ path: 'd' }, { path: 'e' }, { path: 'f' }, { path: 'g' }], candidates: [], parked: [] },
    { name: 'doc-anchors', violations: [{ path: 'h' }, { path: 'i' }, { path: 'j' }, { path: 'k' }, { path: 'l' }], candidates: [], parked: [] },
    { name: 'suite-self', violations: [{ path: 'm' }, { path: 'n' }, { path: 'o' }, { path: 'p' }], candidates: [], parked: [] },
  ]
  assert.equal(computeScore(results, health).score, 0)
})

test('computeScore: custom weights from the rules file', () => {
  const health = { weights: { violation: 20 }, ledger: [] }
  const results = [
    { name: 'line-limit', violations: [{ path: 'a' }], candidates: [], parked: [] },
  ]
  assert.equal(computeScore(results, health).score, 80)
})

test('computeScore: severity bands weight a monster more than a near-limit park', () => {
  const health = {
    weights: { parked: 0.5 },
    parkedWeights: {
      'line-limit': [
        { min: 301, max: 400, weight: 0.5 },
        { min: 401, max: 600, weight: 1 },
        { min: 601, max: 1000, weight: 2 },
        { min: 1001, weight: 3 },
      ],
    },
    ledger: [],
  }
  const results = [
    {
      name: 'line-limit',
      violations: [],
      candidates: [],
      parked: [
        { path: 'near.rs', lines: 302 }, // 0.5
        { path: 'mid.rs', lines: 450 }, // 1
        { path: 'big.rs', lines: 800 }, // 2
        { path: 'monster.rs', lines: 2000 }, // 3
      ],
    },
  ]
  const { score, breakdown } = computeScore(results, health)
  assert.equal(breakdown['line-limit'].deduction, 6.5) // 0.5 + 1 + 2 + 3
  assert.equal(score, 94) // 100 - 6.5, integer-rounded
})

test('computeScore: parked entries without lines fall back to the flat weight', () => {
  const health = {
    weights: { parked: 0.5 },
    parkedWeights: { 'line-limit': [{ min: 301, max: 400, weight: 0.5 }] },
    ledger: [],
  }
  const results = [{ name: 'line-limit', violations: [], candidates: [], parked: [{ path: 'a', reason: 'r' }] }]
  const { breakdown } = computeScore(results, health)
  assert.equal(breakdown['line-limit'].deduction, 0.5)
})

test('parkedWeightFor: entry below the lowest band falls back to the flat weight', () => {
  const health = { parkedWeights: { 'line-limit': [{ min: 401, max: 600, weight: 1 }] } }
  assert.equal(parkedWeightFor(health, 'line-limit', { lines: 350 }, 0.5), 0.5)
})

test('rankWork: violation (P0) above ledger P1 above candidate above parked-tripwire', () => {
  const health = { weights: {}, ledger: [{ id: 'ledger-p1', priority: 'P1', reason: 'r' }] }
  const work = rankWork(RESULTS, health, ROOT)
  assert.equal(work[0].class, 'violation')
  assert.equal(work.find((w) => w.class === 'ledger').priority, 'P1')
  assert.equal(work.find((w) => w.class === 'candidate').priority, 'P2')
  assert.equal(work.find((w) => w.class === 'parked-tripwire').priority, 'P3')
})

test('rankWork: tripwire fires only when the file was touched after parking', () => {
  // This repo's own files are git truth: a file committed after its `since`
  // date must fire; a file committed before (or with no `since`) must not.
  const results = [
    {
      name: 'stale-binary',
      violations: [],
      candidates: [],
      parked: [
        // Real file, committed long after 2026-01-01 -> fires.
        { path: 'README.md', reason: 'parked - revisit on next touching change', since: '2026-01-01T00:00:00' },
        // Real file, committed before its since -> parked, no fire.
        { path: 'AGENTS.md', reason: 'parked - revisit on next touching change', since: '2030-01-01T00:00:00' },
        // Reason without the tripwire phrase -> never fires.
        { path: 'README.md', reason: 'permitted branding', since: '2026-01-01T00:00:00' },
      ],
    },
  ]
  const work = rankWork(results, { weights: {}, ledger: [] }, ROOT)
  const tripwires = work.filter((w) => w.class === 'parked-tripwire')
  assert.equal(tripwires.length, 1)
  assert.equal(tripwires[0].name, 'README.md')
})

test('trend: empty array when no trend file exists', () => {
  const tmp = join(tmpdir(), 'health-trend-test.json')
  try {
    if (existsSync(tmp)) writeFileSync(tmp, '[]')
    process.env.TREND_PATH = tmp
    assert.ok(Array.isArray(loadTrend()))
  } finally {
    delete process.env.TREND_PATH
    rmSync(tmp, { force: true })
  }
})

test('trend: one entry per day (same-day runs dedupe)', () => {
  const tmp = join(tmpdir(), 'health-trend-test.json')
  try {
    writeFileSync(tmp, '[]')
    process.env.TREND_PATH = tmp
    const entry = { date: '2026-08-09', score: 88, deduction: 12, workCount: 3 }
    appendTrend(entry)
    appendTrend(entry)
    const trend = JSON.parse(readFileSync(tmp, 'utf8'))
    assert.equal(trend.length, 1)
  } finally {
    delete process.env.TREND_PATH
    rmSync(tmp, { force: true })
  }
})
