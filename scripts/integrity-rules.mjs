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
  lineLimit: 300,
  lineLimitPaths: ['src-tauri/src', 'frontend/src', 'workbench-companion-neoforge-1.21/src', 'scripts'],
  assetDirs: ['frontend/public', 'frontend/src/assets'],
  // Staleness is per-binary and per-workflow (F4 fix, 2026-08-09):
  //   debug binary — `pnpm dev` hot-reloads frontend via Vite, so ONLY
  //     backend edits stale it (frontend edits must NOT fire STALE).
  //   release binary — embeds the frontend bundle, so both stale it.
  staleBinaries: [
    {
      name: 'dev',
      path: 'src-tauri/target/debug/modcanvas',
      sourcePaths: ['src-tauri/src'],
    },
    {
      name: 'release',
      path: 'src-tauri/target/release/modcanvas',
      sourcePaths: ['src-tauri/src', 'frontend/src'],
    },
  ],
  adapterDirs: ['frontend/src/adapters'],
  docSync: {
    codePaths: ['src-tauri/src', 'frontend/src'],
    docPaths: ['docs', 'README.md', 'AGENTS.md'],
    lookback: 10,
  },
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

export const loadRules = () => (existsSync(RULES_PATH) ? mergeRules(DEFAULT_RULES, JSON.parse(readFileSync(RULES_PATH, 'utf8'))) : DEFAULT_RULES)
