// integrity-suite.mjs — the suite checking ITSELF (the s13 meta-rule: the
// tooling is a maintainership artifact with the same failure classes — doc
// drift, stale references, dead scripts). Data-driven via the rules file.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function checkSuiteSelf(rules, root) {
  const violations = []
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

  // 3. Every pnpm script mentioned in the docs exists in package.json.
  const docsPath = join(root, docsFile)
  const pkgPath = join(root, packageJson)
  if (existsSync(docsPath) && existsSync(pkgPath)) {
    const docs = readFileSync(docsPath, 'utf8')
    const pkg = safeJson(readFileSync(pkgPath, 'utf8'))
    const scripts = pkg?.scripts ?? {}
    for (const m of docs.matchAll(/`pnpm ([\w:.-]+)`/g)) {
      if (!(m[1] in scripts)) violations.push({ path: `docs mention pnpm ${m[1]} but package.json has no such script` })
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

  return { violations, info }
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
