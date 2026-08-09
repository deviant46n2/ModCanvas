// integrity-git.mjs — git-aware checks for the integrity gate.
//
// Split from integrity-check.mjs when the engine tripped its own 300-line
// rule (s22 — the tripwire working on the tool itself). The seam is natural:
// these three checks need a git repo; the tree checks don't.

import { execFileSync } from 'node:child_process'

export function checkDiffHygiene(rules, root) {
  const violations = []
  for (const args of [['diff', '--check'], ['diff', '--cached', '--check']]) {
    try {
      execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    } catch (e) {
      const out = String(e.stdout ?? '')
      if (out.trim()) violations.push({ message: `git ${args.join(' ')}:\n${out.trim()}` })
      else throw new Error(`git ${args.join(' ')} failed: ${e.message}`)
    }
  }
  return { violations }
}

// Adapter matrix discipline: a new version/loader = a NEW file, never an edit
// to an existing adapter (editing existing adapters breaks other versions
// silently). Modified (M), deleted (D), or renamed (R) existing adapters are
// all violations — a deletion removes functionality for that version, a
// rename breaks the factory's imports; only an ADD (A) of a new file is fine.
export function checkAdapterMatrix(rules, root) {
  const violations = []
  const parked = []
  let status
  try {
    status = execFileSync('git', ['diff', '--name-status', 'HEAD'], { cwd: root, encoding: 'utf8' })
  } catch (e) {
    throw new Error(`git diff failed: ${e.message}`)
  }
  for (const line of status.split('\n')) {
    if (!line.trim()) continue
    const fields = line.split('\t')
    const code = fields[0]
    const path = code.startsWith('R') ? fields[2] : fields[1] // renames carry old + new
    if (!['M', 'D', 'R'].some((c) => code.startsWith(c)) || !path) continue
    const isAdapter = rules.adapterDirs.some((d) => path.startsWith(d + '/'))
    if (!isAdapter) continue
    const entry = rules.allowlists['adapter-matrix'].find((a) => a.path === path)
    const label = code.startsWith('D') ? 'deleted' : code.startsWith('R') ? 'renamed' : 'modified'
    if (entry) parked.push({ path, reason: entry.reason })
    else violations.push({ path: `${label} adapter: ${path}` })
  }
  return { violations, parked }
}

// Doc-sync: a commit that changes code but no doc is a drift CANDIDATE (the
// maintainer judges — pure refactors and reverts are legitimately doc-less).
// Surfaced, never a gate: false positives would break the gate's signal.
export function checkDocSync(rules, root) {
  const candidates = []
  let log
  try {
    log = execFileSync('git', ['log', `-${rules.docSync.lookback}`, '--format=%h', '--name-only'], {
      cwd: root,
      encoding: 'utf8',
    })
  } catch (e) {
    return { violations: [], candidates, info: [{ message: `no git history (${e.message})` }] }
  }
  const { codePaths, docPaths } = rules.docSync
  let commit = null
  const files = []
  const flush = () => {
    if (!commit) return
    const touchedCode = files.some((f) => codePaths.some((p) => f.startsWith(p)))
    const touchedDoc = files.some((f) => docPaths.some((p) => f.startsWith(p) || f === p))
    if (touchedCode && !touchedDoc) {
      candidates.push({ commit, files: files.filter((f) => codePaths.some((p) => f.startsWith(p))).slice(0, 5) })
    }
  }
  for (const line of log.split('\n')) {
    if (/^[0-9a-f]{7,40}$/.test(line.trim())) {
      flush()
      commit = line.trim()
      files.length = 0
    } else if (line.trim()) {
      files.push(line.trim())
    }
  }
  flush()
  return { violations: [], candidates }
}
