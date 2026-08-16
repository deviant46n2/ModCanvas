// integrity-select.mjs — section-selection logic for the integrity engine.
//
// Split out of integrity-check.mjs (s65) when the CLI gained multi-section
// selection + --skip= for platform-aware CI runs (Windows skips build-smoke,
// which spawns `sh`). Pure selection: given the section catalog and the
// requested names/skips, return the selected subset — or throw with the
// available names. The engine's line count stays under its own soft limit.
//
// Semantics:
//   names []            → all sections (empty = no restriction, not "none")
//   skip  ['x']         → all except x (--skip=build-smoke for Windows CI)
//   names ['a','b']     → exactly a and b
//   unknown name/skip   → Error (loud, never a silent partial run)

export const SECTION_NAMES = [
  'line-limit',
  'asset-bundle',
  'stale-binary',
  'diff-hygiene',
  'adapter-matrix',
  'doc-sync',
  'doc-anchors',
  'build-smoke',
  'suite-self',
]

/**
 * Select the sections to run.
 * @param {string[]} sections  the available sections (each { name, run })
 * @param {string[]} names     requested section names ([] = all)
 * @param {string[]} skip      section names to exclude
 * @returns {{name: string, run: Function}[]}
 */
export function selectSections(sections, names = [], skip = []) {
  const unknown = [...names, ...skip].filter((n) => !sections.some((s) => s.name === n))
  if (unknown.length > 0) {
    throw new Error(
      `unknown section(s) "${unknown.join('", "')}" (${SECTION_NAMES.join('|')})`,
    )
  }
  const selected = sections.filter(
    (s) => (names.length === 0 || names.includes(s.name)) && !skip.includes(s.name),
  )
  if (selected.length === 0) {
    throw new Error('all sections skipped — nothing to run')
  }
  return selected
}

/**
 * Parse CLI args into { seed, names, skip }.
 * @param {string[]} args process.argv.slice(2)
 */
export function parseArgs(args) {
  const seed = args.includes('--seed')
  const skip = args.filter((a) => a.startsWith('--skip=')).flatMap((a) => a.slice(7).split(',').filter(Boolean))
  const names = args.filter((a) => a !== '--seed' && !a.startsWith('--skip='))
  return { seed, names, skip }
}