// integrity-doc.mjs — doc-vs-code consistency anchors for the integrity gate.
//
// The commit-level doc-sync check (integrity-git.mjs) catches *new* drift;
// this one catches *content* drift: specific facts that must agree between a
// doc and the code it describes (CACHE_VERSION, jar versions, ports...).
// Anchors are data in the rules file — new anchor = new rules entry, never
// an edit to this engine.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function checkDocAnchors(rules, root) {
  const violations = []
  const info = []
  for (const anchor of rules.docAnchors ?? []) {
    const codeFile = join(root, anchor.codeFile)
    const docFile = join(root, anchor.docFile)
    if (!existsSync(codeFile) || !existsSync(docFile)) {
      info.push({ message: `anchor ${anchor.name}: missing file (code=${anchor.codeFile} doc=${anchor.docFile}) — update rules` })
      continue
    }
    const code = readFileSync(codeFile, 'utf8')
    const doc = readFileSync(docFile, 'utf8')
    // Normalize patterns from rules data: RegExp literals or JSON strings.
    const codeRe = new RegExp(anchor.codePattern.source ?? anchor.codePattern, 'g')
    const docRe = new RegExp(anchor.docPattern.source ?? anchor.docPattern, 'g')
    const codeValues = [...code.matchAll(codeRe)].map((m) => m[1])
    if (!codeValues.length) {
      info.push({ message: `anchor ${anchor.name}: pattern not found in code (${anchor.codeFile}) — update rules` })
      continue
    }
    const unique = [...new Set(codeValues)]
    if (unique.length > 1) {
      // Ambiguous authority: several values in code — never guess (F8 fix).
      violations.push({
        path: `anchor ${anchor.name}: multiple values in code (${unique.join(', ')} at ${anchor.codeFile}) — update rules to disambiguate`,
      })
      continue
    }
    const codeValue = unique[0]
    const docValues = [...doc.matchAll(docRe)].map((m) => m[1])
    if (!docValues.length) {
      info.push({ message: `anchor ${anchor.name}: doc (${anchor.docFile}) does not mention it — verify this is intended` })
      continue
    }
    const stale = docValues.filter((v) => v !== codeValue)
    for (const v of stale) {
      violations.push({ path: `${anchor.docFile} mentions ${anchor.name}="${v}" but ${anchor.codeFile} has "${codeValue}"` })
    }
  }
  return { violations, info }
}
