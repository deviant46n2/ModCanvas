// integrity-build.mjs — build-smoke section: the frontend must actually build.
//
// The bd4016b failure class (s34 audit): a refactor split RecipeEditor.css
// into recipe-styles/ but the new barrel imported the OLD paths
// (./recipe-layout.css instead of ./recipe-styles/recipe-layout.css). tsc
// does not resolve CSS imports, so the break shipped silently and the app
// ran with missing styles for ~2.5h until accfab5 repaired the barrel.
//
// The check: run the frontend's OWN build script (tsc -b && vite build) —
// the exact command the app ships with. A frontend that cannot build cannot
// serve behavior claims. Skippable via rules.buildSmoke.skip for
// dependency-less environments.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function checkBuildSmoke(rules, root) {
  const violations = []
  const parked = []
  const info = []
  const cfg = rules.buildSmoke ?? {}

  if (cfg.skip) {
    info.push({ message: 'build-smoke skipped by rules.buildSmoke.skip' })
    return { violations, parked, info }
  }

  const frontendDir = join(root, 'frontend')
  if (!existsSync(join(frontendDir, 'package.json'))) {
    violations.push({ path: 'frontend/package.json', message: 'missing — cannot verify the frontend builds' })
    return { violations, parked, info }
  }

  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf8'))
  } catch (e) {
    violations.push({ path: 'frontend/package.json', message: `unparseable: ${e.message}` })
    return { violations, parked, info }
  }

  const buildScript = pkg.scripts?.build
  if (!buildScript) {
    violations.push({ path: 'frontend/package.json', message: 'no "build" script — cannot verify the frontend builds' })
    return { violations, parked, info }
  }

  if (!existsSync(join(frontendDir, 'node_modules'))) {
    violations.push({ path: 'frontend/node_modules', message: 'missing — run pnpm install first (the build cannot be verified)' })
    return { violations, parked, info }
  }

  // Resolve local binaries exactly as pnpm does: prepend node_modules/.bin to
  // PATH so `tsc`, `vite`, etc. resolve without a global install.
  const binDir = join(frontendDir, 'node_modules', '.bin')
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  const res = spawnSync('sh', ['-c', buildScript], {
    cwd: frontendDir,
    encoding: 'utf8',
    timeout: cfg.timeoutMs ?? 300_000,
    env,
  })

  if (res.error) {
    violations.push({ path: 'frontend build', message: `could not run: ${res.error.message}` })
  } else if (res.status !== 0) {
    const tail = `${res.stdout}\n${res.stderr}`.trim().split('\n').slice(-12).join('\n')
    violations.push({
      path: 'frontend build',
      message: `\`${buildScript}\` failed (exit ${res.status}):\n${tail}`,
    })
  }
  return { violations, parked, info }
}
