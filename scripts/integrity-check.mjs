#!/usr/bin/env node
// integrity-check.mjs — the P2 invariant catalog as executable checks.
//
// The engine here is GENERIC; the rules live in scripts/integrity-rules.json
// (data, not code). That split is the lift-out seam: a second project copies
// the engine and writes its own rules table. Rules are authoritative once the
// file exists; defaults below only apply before the first --seed.
//
// Sections (each maps to an AGENTS.md invariant):
//   line-limit     — no file > rules.lineLimit lines. Allowlist = parked debt
//                    with a written reason (P4 "park with a reason").
//   asset-bundle   — no game-derived image bytes in frontend/public or
//                    frontend/src/assets; no images in bundle.resources.
//   stale-binary   — the binary embeds src-tauri/** and frontend/**; a binary
//                    older than the newest source silently serves old code.
//   diff-hygiene   — git diff --check (whitespace lies about structure).
//   adapter-matrix — new version/loader = new file; editing an existing
//                    adapter breaks other versions silently (git diff vs HEAD).
//   doc-sync       — code commit without a doc commit = drift CANDIDATE
//                    (maintainer judges; surfaced, never a gate).
//   doc-anchors    — content-level: doc mention ≠ code value (CACHE_VERSION,
//                    jar versions) is a violation (stale doc text).
//   suite-self     — the suite checks itself: command frontmatter, skill
//                    references, docs↔package.json scripts, test files.
//
// Usage (run from the repo root):
//   node scripts/integrity-check.mjs            # all sections; exit 1 on violations
//   node scripts/integrity-check.mjs --seed     # snapshot current tree into rules as parked
//   node scripts/integrity-check.mjs line-limit # one section
// Tests: node --test scripts/integrity-check.test.mjs
//
// Exit codes: 0 clean, 1 violations, 2 error (bad cwd, git failure).

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { checkDiffHygiene, checkAdapterMatrix, checkDocSync } from './integrity-git.mjs'
import { checkDocAnchors } from './integrity-doc.mjs'
import { checkSuiteSelf } from './integrity-suite.mjs'

const RULES_PATH = join(process.cwd(), 'scripts', 'integrity-rules.json')
const DEFAULT_RULES = {
  lineLimit: 300,
  lineLimitPaths: ['src-tauri/src', 'frontend/src', 'workbench-companion-neoforge-1.21/src'],
  assetDirs: ['frontend/public', 'frontend/src/assets'],
  binaryPath: 'src-tauri/target/debug/modcanvas',
  sourcePaths: ['src-tauri/src', 'frontend/src'],
  adapterDirs: ['frontend/src/adapters'],
  suiteSelf: {
    commandsDir: '.opencode/command',
    skillsDir: '.opencode/skills',
    docsFile: 'docs/tooling.md',
    packageJson: 'package.json',
  },
  docAnchors: [
    {
      name: 'cache-version',
      codeFile: 'src-tauri/src/engine_renders.rs',
      codePattern: /CACHE_VERSION: u32 = (\d+)/,
      docFile: 'docs/engine-renders.md',
      docPattern: /CACHE_VERSION\s*(\d+)/g,
    },
    {
      name: 'companion-jar-version',
      codeFile: 'workbench-companion-neoforge-1.21/build.gradle',
      codePattern: /^version\s*=\s*'([^']+)'/m,
      docFile: 'AGENTS.md',
      docPattern: /workbench-companion-([\d.]+)\.jar/g,
    },
  ],
  docSync: {
    codePaths: ['src-tauri/src', 'frontend/src'],
    docPaths: ['docs', 'README.md', 'AGENTS.md'],
    lookback: 10,
  },
  allowlists: {
    'line-limit': [],
    'asset-bundle': [],
    'adapter-matrix': [],
  },
}

const RASTER = /\.(png|jpe?g|gif|webp|bmp|ico)$/i

// --- rules loading -------------------------------------------------------

// The on-disk rules file is authoritative once it exists, but the engine may
// grow new config keys later. Merge: loaded rules overlay the defaults, and
// defaults fill any gaps — a stale rules file must never crash the gate.
export function mergeRules(base, over) {
  return {
    ...base,
    ...over,
    allowlists: { ...base.allowlists, ...(over.allowlists ?? {}) },
  }
}

const loadRules = () => (existsSync(RULES_PATH) ? mergeRules(DEFAULT_RULES, JSON.parse(readFileSync(RULES_PATH, 'utf8'))) : DEFAULT_RULES)

// --- pure helpers ---------------------------------------------------------

export function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // missing dir = no files
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const lineCount = (file) => (readFileSync(file, 'utf8').match(/\n/g) ?? []).length

// --- checks --------------------------------------------------------------

export function checkLineLimit(rules, root) {
  const violations = []
  const parked = []
  for (const dir of rules.lineLimitPaths) {
    for (const file of walk(join(root, dir))) {
      const lines = lineCount(file)
      if (lines <= rules.lineLimit) continue
      const rel = relative(root, file)
      const entry = rules.allowlists['line-limit'].find((a) => a.path === rel)
      if (entry) parked.push({ path: rel, lines, reason: entry.reason })
      else violations.push({ path: rel, lines })
    }
  }
  return { violations, parked }
}

export function checkAssetBundle(rules, root) {
  const violations = []
  const parked = []
  const allow = rules.allowlists['asset-bundle']
  for (const dir of rules.assetDirs) {
    for (const file of walk(join(root, dir))) {
      if (!RASTER.test(file)) continue
      const rel = relative(root, file)
      const entry = allow.find((a) => a.path === rel)
      if (entry) parked.push({ path: rel, reason: entry.reason })
      else violations.push({ path: rel })
    }
  }
  // bundle.resources must not reference images either (AGENTS.md rule 6).
  const conf = join(root, 'src-tauri', 'tauri.conf.json')
  if (existsSync(conf)) {
    const raw = readFileSync(conf, 'utf8')
    if (/"resources"\s*:/i.test(raw)) {
      try {
        const res = JSON.parse(raw)?.bundle?.resources
        if (Array.isArray(res)) {
          for (const r of res) {
            if (RASTER.test(String(r))) violations.push({ path: `bundle.resources -> ${r}` })
          }
        }
      } catch {
        violations.push({ path: 'tauri.conf.json (has a resources key that failed to parse — verify manually)' })
      }
    }
  }
  return { violations, parked }
}

export function checkStaleBinary(rules, root) {
  const info = []
  const violations = []
  const bin = join(root, rules.binaryPath)
  if (!existsSync(bin)) {
    return { violations, info: [{ message: `no binary at ${rules.binaryPath} — build first (pnpm dev / pnpm build)` }] }
  }
  let newest = 0
  for (const dir of rules.sourcePaths) {
    for (const f of walk(join(root, dir))) {
      newest = Math.max(newest, statSync(f).mtimeMs)
    }
  }
  const binTime = statSync(bin).mtimeMs
  if (binTime < newest) {
    violations.push({
      message: `binary (${new Date(binTime).toISOString()}) older than newest source (${new Date(newest).toISOString()}) — STALE`,
    })
  } else {
    info.push({ message: 'binary newer than all sources' })
  }
  return { violations, info }
}

// --- reporting -----------------------------------------------------------

export function report(results) {
  let violationCount = 0
  for (const section of results) {
    const violations = section.violations ?? []
    const n = violations.length
    violationCount += n
    console.log(`\n== ${section.name} ==`)
    for (const v of section.violations) {
      console.log(`  VIOLATION  ${v.path ?? v.message}${v.lines ? ` (${v.lines} lines)` : ''}`)
    }
    for (const c of section.candidates ?? []) {
      console.log(`  candidate  commit ${c.commit} changed code without docs: ${(c.files ?? []).join(', ')}`)
    }
    for (const p of section.parked ?? []) {
      console.log(`  parked     ${p.path} — ${p.reason}`)
    }
    for (const i of section.info ?? []) {
      console.log(`  info       ${i.message}`)
    }
    if (n === 0 && !(section.candidates?.length) && !(section.parked?.length) && !(section.info?.length)) console.log('  clean')
  }
  console.log(`\n${violationCount} violation(s).`)
  return violationCount
}

// --- seeding -------------------------------------------------------------

export function seedRules(rulesPath, rules, root) {
  // The on-disk rules file is authoritative once it exists; before that, the
  // passed rules (defaults or caller-constructed) are the base to extend.
  const existing = existsSync(rulesPath) ? mergeRules(rules, JSON.parse(readFileSync(rulesPath, 'utf8'))) : rules
  const add = (key, list, reason) => {
    const cur = existing.allowlists[key] ?? []
    const known = new Set(cur.map((a) => a.path))
    for (const v of list) {
      if (!known.has(v.path)) cur.push({ path: v.path, reason })
    }
    existing.allowlists[key] = cur
  }
  const reasonLine = `pre-existing at tool introduction (${new Date().toISOString().slice(0, 10)}); parked — revisit on next touching change`
  add('line-limit', checkLineLimit(rules, root).violations, reasonLine)
  add('asset-bundle', checkAssetBundle(rules, root).violations, reasonLine)
  writeFileSync(rulesPath, JSON.stringify(existing, null, 2) + '\n')
  return existing
}

// --- main ----------------------------------------------------------------

function main() {
  const [arg] = process.argv.slice(2)
  const root = process.cwd()
  if (!existsSync(join(root, 'src-tauri', 'src'))) {
    console.error('integrity-check: run from the repo root (no src-tauri/src here)')
    process.exit(2)
  }
  const rules = loadRules()

  if (arg === '--seed') {
    seedRules(RULES_PATH, rules, root)
    console.log(`seeded ${RULES_PATH}`)
  }

  const sections = [
    { name: 'line-limit', run: () => checkLineLimit(rules, root) },
    { name: 'asset-bundle', run: () => checkAssetBundle(rules, root) },
    { name: 'stale-binary', run: () => checkStaleBinary(rules, root) },
    { name: 'diff-hygiene', run: () => checkDiffHygiene(rules, root) },
    { name: 'adapter-matrix', run: () => checkAdapterMatrix(rules, root) },
    { name: 'doc-sync', run: () => checkDocSync(rules, root) },
    { name: 'doc-anchors', run: () => checkDocAnchors(rules, root) },
    { name: 'suite-self', run: () => checkSuiteSelf(rules, root) },
  ]
  const selected = arg && arg !== '--seed' ? sections.filter((s) => s.name === arg) : sections
  if (!selected.length) {
    console.error(
      `integrity-check: unknown section "${arg}" (line-limit|asset-bundle|stale-binary|diff-hygiene|adapter-matrix|doc-sync|doc-anchors|suite-self)`,
    )
    process.exit(2)
  }
  try {
    const results = selected.map((s) => ({ name: s.name, ...s.run() }))
    process.exit(report(results) > 0 ? 1 : 0)
  } catch (e) {
    console.error(`integrity-check: ${e.message}`)
    process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
