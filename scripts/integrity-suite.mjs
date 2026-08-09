// integrity-suite.mjs — the suite checking ITSELF (the s13 meta-rule: the
// tooling is a maintainership artifact with the same failure classes — doc
// drift, stale references, dead scripts). Data-driven via the rules file.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function checkSuiteSelf(rules, root) {
  const violations = []
  const candidates = []
  const info = []
  const { commandsDir, skillsDir, docsFile, packageJson } = rules.suiteSelf

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

  // 3. pnpm scripts referenced in the docs. Backticked references are
  //    unambiguous claims — a missing script is a VIOLATION. Plain
  //    (unbackticked) references are ambiguous prose ("no pnpm here") — they
  //    surface as CANDIDATES telling the writer to backtick, never as gate
  //    failures. pnpm's own verbs (install/add/...) are never scripts.
  const docsPath = join(root, docsFile)
  const pkgPath = join(root, packageJson)
  const PNPM_VERBS = new Set([
    'install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'dlx', 'exec', 'init', 'create',
    'link', 'unlink', 'prune', 'pack', 'publish', 'root', 'bin', 'env', 'config', 'help',
    'ls', 'list', 'why', 'outdated', '-v', '--version',
  ])
  if (existsSync(docsPath) && existsSync(pkgPath)) {
    const docs = readFileSync(docsPath, 'utf8')
    const pkg = safeJson(readFileSync(pkgPath, 'utf8'))
    const scripts = pkg?.scripts ?? {}
    for (const m of docs.matchAll(/`pnpm (?:(?:run)\s+)?([\w:-]+)`/g)) {
      if (PNPM_VERBS.has(m[1])) continue
      if (!(m[1] in scripts)) violations.push({ path: `docs mention pnpm ${m[1]} but package.json has no such script` })
    }
    for (const m of docs.matchAll(/\bpnpm (?:(?:run)\s+)?([\w:-]+)/g)) {
      if (PNPM_VERBS.has(m[1])) continue
      if (m[1] in scripts) continue // plain but exists — verified silently
      candidates.push({ path: `plain pnpm reference "${m[1]}" but package.json has no such script — backtick if prose, fix if real` })
    }
  }

  // 4. The test:tools script's test files exist.
  if (existsSync(pkgPath)) {
    const pkg = safeJson(readFileSync(pkgPath, 'utf8'))
    const testCmd = pkg?.scripts?.['test:tools'] ?? ''
    for (const f of testCmd.matchAll(/[\w./-]+\.test\.mjs/g)) {
      if (!existsSync(join(root, f[0]))) violations.push({ path: `test:tools lists missing file ${f[0]}` })
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
