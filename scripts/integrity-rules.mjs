// integrity-rules.mjs — the rules/config layer of the integrity gate.
//
// Split out of integrity-check.mjs when the engine tripped its own 300-line
// rule for the SECOND time (s22 audit pass) — the config layer is a coherent
// unit, and the engine must stay under the limit it enforces.
//
// The on-disk rules file (scripts/integrity-rules.json) is authoritative once
// it exists; the defaults here fill any gaps via mergeRules — a stale rules
// file must never crash the gate.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const RULES_PATH = join(process.cwd(), 'scripts', 'integrity-rules.json')

export const DEFAULT_RULES = {
  // Line-count policy (s52 governance): 300 is the advisory heuristic, not an
  // absolute law — cohesion > arbitrary count. Files over the soft limit must
  // get a written PARKED/ACCEPTED reason (reported as candidates); only files
  // over the hard limit fail the gate. See AGENTS.md "File & Function Size
  // Limits".
  lineLimit: 300,
  lineLimitHard: 600,
  lineLimitPaths: ['src-tauri/src', 'frontend/src', 'workbench-companion-neoforge-1.21/src', 'scripts'],
  assetDirs: ['frontend/public', 'frontend/src/assets'],
  // Staleness is per-binary and per-workflow (F4 fix, 2026-08-09):
  //   debug binary — `pnpm dev` hot-reloads frontend via Vite, so ONLY
  //     backend edits stale it (frontend edits must NOT fire STALE).
  //   release binary — embeds the frontend bundle, so both stale it.
  //   Both embed src-tauri/templates/** via include_str! (templates/mod.rs),
  //     so template content edits stale both (s72 coverage gap: the
  //     readability-pass copy edits were invisible to this gate until fixed).
  staleBinaries: [
    {
      name: 'dev',
      path: 'src-tauri/target/debug/modcanvas',
      sourcePaths: ['src-tauri/src', 'src-tauri/templates'],
    },
    {
      name: 'release',
      path: 'src-tauri/target/release/modcanvas',
      sourcePaths: ['src-tauri/src', 'src-tauri/templates', 'frontend/src'],
    },
    {
      // The companion mod is a separate artifact (a game jar) with its own
      // rebuild+deploy loop (AGENTS.md). The app binaries above cannot see it,
      // so a stale companion jar silently serves old render/registry behavior
      // (s61: the `stale-binary` coverage gap let an old bundled jar ship and
      // the parity fix never load until re-wrapped). Source = companion Java;
      // binary = the built jar.
      name: 'companion',
      path: 'workbench-companion-neoforge-1.21/build/libs/workbench-companion-1.0.0.jar',
      sourcePaths: ['workbench-companion-neoforge-1.21/src'],
    },
  ],
  adapterDirs: ['frontend/src/adapters'],
  docSync: {
    codePaths: ['src-tauri/src', 'frontend/src'],
    docPaths: ['docs', 'README.md', 'AGENTS.md'],
    lookback: 10,
    // A doc-sync candidate the maintainer has JUDGED — either legitimately
    // doc-less (pure refactor/revert/test-only) or its docs written elsewhere.
    // The written reason is the permanent proof (s30: aged-out unjudged
    // candidates were vanishing silently — 65c1fe8 went 5 sessions unpaid).
    judgments: [],
  },
  suiteSelf: {
    commandsDir: '.opencode/command',
    skillsDir: '.opencode/skills',
    docsFiles: ['docs/tooling.md', 'todo-tooling.md', 'AGENTS.md'],
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
  allowlists: {
    'line-limit': [],
    'asset-bundle': [],
    'adapter-matrix': [],
    'stale-binary': [],
  },
}

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

// Doc-sync judgments are DATA and live in their own file (scripts/
// doc-sync-judgments.json) so integrity-rules.json stays under the 300-line
// limit the gate enforces — s32: six journey-fix judgments pushed the rules
// file to 302 and the suite-self check caught its own config.
export const JUDGMENTS_PATH = join(process.cwd(), 'scripts', 'doc-sync-judgments.json')

export const loadRules = () => {
  const base = existsSync(RULES_PATH)
    ? mergeRules(DEFAULT_RULES, JSON.parse(readFileSync(RULES_PATH, 'utf8')))
    : DEFAULT_RULES
  if (!existsSync(JUDGMENTS_PATH)) return base
  const extra = JSON.parse(readFileSync(JUDGMENTS_PATH, 'utf8'))
  return {
    ...base,
    docSync: {
      ...(base.docSync ?? {}),
      judgments: [...(base.docSync?.judgments ?? []), ...(extra.judgments ?? [])],
    },
  }
}
