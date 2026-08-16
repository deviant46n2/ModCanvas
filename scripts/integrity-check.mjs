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
//   build-smoke    — the frontend must actually build (tsc + vite). Catches
//                    the bd4016b class: import-resolution breaks tsc cannot
//                    see (CSS/asset paths), which ship silently.
//   suite-self     — the suite checks itself: command frontmatter, skill
//                    references, docs↔package.json scripts, test files.
//
// Usage (run from the repo root):
//   node scripts/integrity-check.mjs            # all sections; exit 1 on violations
//   node scripts/integrity-check.mjs --seed     # snapshot current tree into rules as parked
//   node scripts/integrity-check.mjs line-limit # one section
//   node scripts/integrity-check.mjs line-limit asset-bundle   # several sections
//   node scripts/integrity-check.mjs --skip=build-smoke        # all except named
//   node scripts/integrity-check.mjs --skip=build-smoke,suite-self  # comma-separated
//   # --skip exists for platform-aware runs (build-smoke spawns `sh`, Linux-only);
//   # unknown section names error loudly (exit 2) — no silent partial runs.
// Tests: node --test scripts/integrity-check.test.mjs
//
// Exit codes: 0 clean, 1 violations, 2 error (bad cwd, git failure).

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { RULES_PATH, loadRules, mergeRules } from './integrity-rules.mjs'
import { checkDiffHygiene, checkAdapterMatrix, checkDocSync } from './integrity-git.mjs'
import { checkDocAnchors } from './integrity-doc.mjs'
import { checkSuiteSelf } from './integrity-suite.mjs'
import { checkBuildSmoke } from './integrity-build.mjs'
import { selectSections, parseArgs } from './integrity-select.mjs'

const RASTER = /\.(png|jpe?g|gif|webp|bmp|ico)$/i

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

// Editor-accurate line count: wc -l counts newlines, but a 301-line file
// without a trailing newline has only 300 \n. Count the final unterminated
// line too (F9 fix).
const lineCount = (file) => {
  const text = readFileSync(file, 'utf8')
  return (text.match(/\n/g) ?? []).length + (text.length > 0 && !text.endsWith('\n') ? 1 : 0)
}

// --- checks --------------------------------------------------------------

export function checkLineLimit(rules, root) {
  const violations = []
  const parked = []
  const accepted = []
  const candidates = []
  const hard = rules.lineLimitHard ?? rules.lineLimit * 2
  for (const dir of rules.lineLimitPaths) {
    for (const file of walk(join(root, dir))) {
      const lines = lineCount(file)
      if (lines <= rules.lineLimit) continue
      const rel = relative(root, file)
      const entry = rules.allowlists['line-limit'].find((a) => a.path === rel)
      if (entry) {
        // kind: "accepted" = an intentional decision, not debt — zero
        // deduction, never a work item (s36). Everything else parked.
        if (entry.kind === 'accepted') accepted.push({ path: rel, lines, reason: entry.reason })
        else parked.push({ path: rel, lines, reason: entry.reason, since: entry.since })
      } else if (lines > hard) {
        // Only genuinely runaway files fail the gate (s52 governance: the
        // 300-line rule is a heuristic with a written-appeal path, not a law).
        violations.push({ path: rel, lines })
      } else {
        candidates.push({
          path: rel,
          lines,
          message: `over ${rules.lineLimit}-line soft limit (${lines} lines) — needs a written PARKED/ACCEPTED reason`,
        })
      }
    }
  }
  return { violations, parked, accepted, candidates }
}

export function checkAssetBundle(rules, root) {
  const violations = []
  const parked = []
  const accepted = []
  const allow = rules.allowlists['asset-bundle']
  for (const dir of rules.assetDirs) {
    for (const file of walk(join(root, dir))) {
      if (!RASTER.test(file)) continue
      const rel = relative(root, file)
      const entry = allow.find((a) => a.path === rel)
      if (entry) {
        if (entry.kind === 'accepted') accepted.push({ path: rel, reason: entry.reason })
        else parked.push({ path: rel, reason: entry.reason })
      } else violations.push({ path: rel })
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
  return { violations, parked, accepted }
}

export function checkStaleBinary(rules, root) {
  const info = []
  const violations = []
  const parked = []
  const accepted = []
  for (const bin of rules.staleBinaries) {
    const abs = join(root, bin.path)
    if (!existsSync(abs)) {
      info.push({ message: `[${bin.name}] no binary at ${bin.path} — build first (pnpm dev / pnpm build)` })
      continue
    }
    let newest = 0
    for (const dir of bin.sourcePaths) {
      for (const f of walk(join(root, dir))) {
        newest = Math.max(newest, statSync(f).mtimeMs)
      }
    }
    const binTime = statSync(abs).mtimeMs
    if (binTime < newest) {
      const entry = (rules.allowlists['stale-binary'] ?? []).find((a) => a.name === bin.name)
      if (entry) {
        if (entry.kind === 'accepted') accepted.push({ path: `[${bin.name}] ${bin.path}`, reason: entry.reason })
        else parked.push({ path: `[${bin.name}] ${bin.path}`, reason: entry.reason })
      } else {
        violations.push({
          message: `[${bin.name}] ${bin.path} (${new Date(binTime).toISOString()}) older than newest ${bin.sourcePaths.join(
            ' + ',
          )} source (${new Date(newest).toISOString()}) — STALE`,
        })
      }
    } else {
      info.push({ message: `[${bin.name}] binary newer than all sources` })
    }
  }
  return { violations, parked, accepted, info }
}

// --- reporting -----------------------------------------------------------

/** Render one candidate by shape: doc-sync candidates carry { commit, files };
 *  other sections (e.g. suite-self) carry { path } or { message }. Rendering
 *  every candidate as a doc-sync candidate printed "commit undefined" (s34 —
 *  a suite-self plain-pnpm candidate was misrendered as a doc-sync one). */
export function formatCandidate(c) {
  if (c.commit) {
    return `commit ${c.commit} changed code without docs: ${(c.files ?? []).join(', ')}`
  }
  return c.path ?? c.message ?? 'unknown candidate'
}

export function report(results) {
  let violationCount = 0
  for (const section of results) {
    const violations = section.violations ?? []
    const n = violations.length
    violationCount += n
    console.log(`\n== ${section.name} ==`)
    for (const v of section.violations) {
      console.log(`VIOLATION: ${v.path ?? v.message}${v.lines ? ` (${v.lines} lines)` : ''}`)
    }
    for (const c of section.candidates ?? []) {
      console.log(`CANDIDATE: ${formatCandidate(c)}`)
    }
    for (const p of section.parked ?? []) {
      console.log(`PARKED:    ${p.path} — ${p.reason}`)
    }
    for (const a of section.accepted ?? []) {
      console.log(`ACCEPTED:  ${a.path} — ${a.reason}`)
    }
    for (const i of section.info ?? []) {
      console.log(`INFO:      ${i.message}`)
    }
    if (n === 0 && !(section.candidates?.length) && !(section.parked?.length) && !(section.accepted?.length) && !(section.info?.length)) console.log('  clean')
  }
  console.log(`\n${violationCount} violation(s).`)
  return violationCount
}

// --- seeding -------------------------------------------------------------

export function seedRules(rulesPath, rules, root) {
  // Seed ONLY the allowlists. Never persist non-allowlist config: the
  // defaults supply it via loadRules' merge, and RegExp-bearing keys
  // (docAnchors) would be destroyed by JSON serialization — a silent
  // check-killer (s22 audit: --seed wrote docAnchors as {} and the
  // doc-anchors check vacuously passed on "[object Object]" matches).
  const fileRules = existsSync(rulesPath) ? JSON.parse(readFileSync(rulesPath, 'utf8')) : {}
  const base = mergeRules(rules, fileRules)
  const add = (key, list, reason) => {
    const cur = base.allowlists[key] ?? []
    const known = new Set(cur.map((a) => a.path ?? a.name))
    for (const v of list) {
      const id = v.path ?? v.name
      if (!known.has(id)) cur.push({ ...v, reason })
    }
    base.allowlists[key] = cur
  }
  const reasonLine = `pre-existing at tool introduction (${new Date().toISOString().slice(0, 10)}); parked — revisit on next touching change`
  add('line-limit', checkLineLimit(rules, root).violations, reasonLine)
  add('asset-bundle', checkAssetBundle(rules, root).violations, reasonLine)
  const next = { ...fileRules, allowlists: base.allowlists }
  writeFileSync(rulesPath, JSON.stringify(next, null, 2) + '\n')
  return next
}

// --- main ----------------------------------------------------------------

export function runAllSections(rules, root, names = [], skip = []) {
  const sections = [
    { name: 'line-limit', run: () => checkLineLimit(rules, root) },
    { name: 'asset-bundle', run: () => checkAssetBundle(rules, root) },
    { name: 'stale-binary', run: () => checkStaleBinary(rules, root) },
    { name: 'diff-hygiene', run: () => checkDiffHygiene(rules, root) },
    { name: 'adapter-matrix', run: () => checkAdapterMatrix(rules, root) },
    { name: 'doc-sync', run: () => checkDocSync(rules, root) },
    { name: 'doc-anchors', run: () => checkDocAnchors(rules, root) },
    { name: 'build-smoke', run: () => checkBuildSmoke(rules, root) },
    { name: 'suite-self', run: () => checkSuiteSelf(rules, root) },
  ]
  return selectSections(sections, names, skip).map((s) => ({ name: s.name, ...s.run() }))
}

function main() {
  const { seed, names, skip } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  if (!existsSync(join(root, 'src-tauri', 'src'))) {
    console.error('integrity-check: run from the repo root (no src-tauri/src here)')
    process.exit(2)
  }
  const rules = loadRules()

  if (seed) {
    seedRules(RULES_PATH, rules, root)
    console.log(`seeded ${RULES_PATH}`)
  }

  try {
    const results = runAllSections(rules, root, names, skip)
    process.exit(report(results) > 0 ? 1 : 0)
  } catch (e) {
    console.error(`integrity-check: ${e.message}`)
    process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
