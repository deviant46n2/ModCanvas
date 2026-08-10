// integrity-suite.mjs — the suite checking ITSELF (the s13 meta-rule: the
// tooling is a maintainership artifact with the same failure classes — doc
// drift, stale references, dead scripts). Data-driven via the rules file.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function checkSuiteSelf(rules, root) {
  const violations = []
  const candidates = []
  const info = []
  const { commandsDir, skillsDir, docsFiles, packageJson } = rules.suiteSelf

  // 1. Every command has agent: tutor + a description in frontmatter.
  const commandsDirAbs = join(root, commandsDir)
  if (existsSync(commandsDirAbs)) {
    for (const file of readdirSync(commandsDirAbs).filter((f) => f.endsWith('.md'))) {
      const fm = frontmatter(readFileSync(join(commandsDirAbs, file), 'utf8'))
      if (fm.agent !== 'tutor') violations.push({ path: `${commandsDir}/${file}: missing agent: tutor` })
      if (!fm.description) violations.push({ path: `${commandsDir}/${file}: missing description` })
    }
  }

  // 2. Every skill a command references actually exists.
  const skillsDirAbs = join(root, skillsDir)
  if (existsSync(commandsDirAbs) && existsSync(skillsDirAbs)) {
    const commandText = readdirSync(commandsDirAbs)
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(join(commandsDirAbs, f), 'utf8'))
      .join('\n')
    for (const name of commandText.matchAll(/tutor-[\w-]+/g)) {
      const skill = name[0]
      if (!existsSync(join(skillsDirAbs, skill, 'SKILL.md'))) {
        violations.push({ path: `${commandsDir} references missing skill ${skill}/SKILL.md` })
      }
    }
  }

  // 3-5. For each docs file: pnpm script claims, and test-count claims.
  //   Backticked pnpm references are unambiguous — a missing script is a
  //   VIOLATION. Plain references are ambiguous prose ("no pnpm here") —
  //   they surface as CANDIDATES, never gate failures. pnpm verbs
  //   (install/add/...) are never scripts.
  //   Test-count claims ("N tests total") must match the real count of
  //   test() calls in the suite's test files — a stale number claim is
  //   doc drift the commit-level check can't see (s22 final pass: docs
  //   said 28, suite had 37).
  const pkgPath = join(root, packageJson)
  const PNPM_VERBS = new Set([
    'install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'dlx', 'exec', 'init', 'create',
    'link', 'unlink', 'prune', 'pack', 'publish', 'root', 'bin', 'env', 'config', 'help',
    'ls', 'list', 'why', 'outdated', '-v', '--version',
  ])
  let realTestCount = -1
  if (existsSync(pkgPath)) {
    const pkg = safeJson(readFileSync(pkgPath, 'utf8'))
    const scriptsRoot = pkg?.scripts ?? {}
    const testCmd = scriptsRoot['test:tools'] ?? ''
    realTestCount = [...testCmd.matchAll(/[\w./-]+\.test\.mjs/g)].reduce((n, m) => {
      const abs = join(root, m[0])
      return n + (existsSync(abs) ? (readFileSync(abs, 'utf8').match(/\btest\(/g) ?? []).length : 0)
    }, 0)
    // 4. The test:tools script's test files exist.
    for (const f of testCmd.matchAll(/[\w./-]+\.test\.mjs/g)) {
      if (!existsSync(join(root, f[0]))) violations.push({ path: `test:tools lists missing file ${f[0]}` })
    }
    for (const docsFile of docsFiles) {
      const docsPath = join(root, docsFile)
      if (!existsSync(docsPath)) continue
      const docs = readFileSync(docsPath, 'utf8')
      // 3. pnpm claims. A reference scoped to a subdir ("(in `frontend/`")
      // resolves against THAT dir's package.json, not the root — false
      // positives on the always-loaded contract are noise (F4 lesson).
      const scopedPkg = (i) => {
        const m = docs.slice(i).match(/\(in [`']?([\w./-]+)[`']?\//)
        if (!m) return null
        const p = join(root, m[1], 'package.json')
        return existsSync(p) ? safeJson(readFileSync(p, 'utf8'))?.scripts ?? null : null
      }
      for (const m of docs.matchAll(/`pnpm (?:(?:run)\s+)?([\w:-]+)`/g)) {
        if (PNPM_VERBS.has(m[1])) continue
        const scoped = scopedPkg(m.index + m[0].length)
        const scripts = scoped ?? scriptsRoot
        if (!(m[1] in scripts)) violations.push({ path: `${docsFile} mentions pnpm ${m[1]} but the relevant package.json has no such script` })
      }
      for (const m of docs.matchAll(/\bpnpm (?:(?:run)\s+)?([\w:-]+)/g)) {
        if (PNPM_VERBS.has(m[1])) continue
        const scoped = scopedPkg(m.index + m[0].length)
        const scripts = scoped ?? scriptsRoot
        if (m[1] in scripts) continue // plain but exists — verified silently
        candidates.push({ path: `${docsFile}: plain pnpm reference "${m[1]}" but the relevant package.json has no such script — backtick if prose, fix if real` })
      }
      // 5. Test-count claims.
      for (const m of docs.matchAll(/(\d+)(?:\/\d+)? tests?\b/g)) {
        if (Number(m[1]) !== realTestCount) {
          violations.push({ path: `${docsFile} claims ${m[0]} but the suite has ${realTestCount} tests — update the doc` })
        }
      }
    }
  }

  // 6. Accepted entries must cite a reviewable decision (an existing doc
  //    file) in their reason. 'accepted' means intentional — and intent must
  //    be verifiable, or 'accepted' becomes a free pass for any debt (the
  //    s36 anti-gaming guard: a reason like 'AGENTS.md permits X' is a
  //    decision; 'we decided' without a location is an excuse).
  for (const [key, entries] of Object.entries(rules.allowlists ?? {})) {
    for (const e of entries ?? []) {
      if (e.kind !== 'accepted') continue
      const cite = (e.reason ?? '').match(/(?:docs\/[\w./-]+\.md|AGENTS\.md|README\.md)/)
      const id = e.path ?? e.name
      if (!cite) {
        violations.push({
          path: `accepted entry ${key}/${id}: reason must cite an existing doc (AGENTS.md, README.md, docs/*.md) — a decision must be reviewable`,
        })
      } else if (!existsSync(join(root, cite[0]))) {
        violations.push({
          path: `accepted entry ${key}/${id}: cited ${cite[0]} does not exist`,
        })
      }
    }
  }

  return { violations, candidates, info }
}

function frontmatter(text) {
  const out = {}
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return out
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2]
  }
  return out
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
