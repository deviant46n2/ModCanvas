#!/usr/bin/env node
// backup-state.mjs — the tutor arc's data is unversioned AND auto-expiring:
//   - .tutor/** is gitignored in the main repo (its internal git was snapshotted
//     once at s13 and never committed again)
//   - the opencode-mem store (~/.opencode-mem/data) auto-cleans memories past
//     autoCleanupRetentionDays (30) and profile items past userProfileStaleDays (2)
// This script tar-archives both (plus the memory config), verifies the archive,
// and audits the expiry risk. Run it at every session boundary.
//
// Usage (run from the repo root):
//   node scripts/backup-state.mjs                # full backup + audit + verify
//   node scripts/backup-state.mjs --audit-only   # no archive, just the risk report
// Tests: node --test scripts/backup-state.test.mjs
//
// Exit codes: 0 ok, 1 backup failed verification.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DEFAULT_SOURCES = {
  tutorDir: join(ROOT, '.tutor'),
  memData: join(process.env.HOME ?? '/home/deviant', '.opencode-mem', 'data'),
  memConfig: join(process.env.HOME ?? '/home/deviant', '.config', 'opencode', 'opencode-mem.jsonc'),
}
const BACKUP_DIR = join(ROOT, 'backups', 'tutor-state')
const KEEP = 5 // archived backups retained; older ones are deleted

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

export function audit(sources) {
  const findings = []
  const note = (severity, message) => findings.push({ severity, message })

  for (const [name, p] of Object.entries(sources)) {
    if (!existsSync(p)) {
      note('error', `${name}: missing (${p})`)
      continue
    }
    const st = statSync(p)
    note('info', `${name}: ${st.isDirectory() ? 'dir' : 'file'} at ${p} (${st.size} bytes, mtime ${st.mtime.toISOString()})`)
  }

  // Memory-store expiry risk from the plugin config.
  if (existsSync(sources.memConfig)) {
    const raw = readFileSync(sources.memConfig, 'utf8')
    const flag = (key) => {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*([^,\\n}]+)`))
      return m ? m[1].trim() : '?'
    }
    const enabled = flag('autoCleanupEnabled')
    const retention = flag('autoCleanupRetentionDays')
    const stale = flag('userProfileStaleDays')
    note('warn', `autoCleanupEnabled=${enabled} retention=${retention}d staleProfile=${stale}d — memories and profile items expire on these clocks; the archive is the only durable copy`)
  }

  // .tutor's internal git: is the arc actually committed there?
  const tutorGit = join(sources.tutorDir, '.git')
  if (existsSync(tutorGit)) {
    try {
      const status = execFileSync('git', ['-C', sources.tutorDir, 'status', '--short'], { encoding: 'utf8' }).trim()
      if (status) note('warn', `.tutor internal git has uncommitted changes:\n${status}`)
      else note('info', '.tutor internal git is clean')
    } catch {
      note('info', '.tutor internal git present but unreadable')
    }
  }

  const backups = existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.tar.gz')) : []
  note('info', `${backups.length} backup(s) in ${BACKUP_DIR}; newest: ${backups.at(-1) ?? 'none'}`)
  return findings
}

export function backup(sources, backupDir = BACKUP_DIR) {
  mkdirSync(backupDir, { recursive: true })
  const ts = stamp()
  const archive = join(backupDir, `tutor-state-${ts}.tar.gz`)

  // Entry names are relative to each -C base (the archive mixes three roots:
  // the repo for .tutor, $HOME for the memory store and the plugin config).
  const parts = []
  if (existsSync(sources.tutorDir)) parts.push(['-C', join(sources.tutorDir, '..'), '.tutor'])
  if (existsSync(sources.memData)) parts.push(['-C', join(sources.memData, '..', '..'), '.opencode-mem/data'])
  if (existsSync(sources.memConfig)) parts.push(['-C', join(sources.memConfig, '..', '..', '..'), '.config/opencode/opencode-mem.jsonc'])
  if (!parts.length) throw new Error('nothing to back up — all sources missing')

  execFileSync('tar', ['-czf', archive, ...parts.flat()])
  writeFileSync(archive.replace(/\.tar\.gz$/, '.manifest.txt'), manifestText(sources, ts), 'utf8')

  // Verify: archive must exist, be non-empty, and contain the key files.
  let listing
  try {
    listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  } catch (e) {
    rmSync(archive, { force: true })
    throw new Error(`archive failed verification (tar list): ${e.message}`)
  }
  const mustContain = [
    existsSync(sources.tutorDir) && '.tutor/profile.md',
    existsSync(sources.tutorDir) && '.tutor/curriculum.md',
    existsSync(sources.memData) && '.opencode-mem/data/user-profiles.db',
    existsSync(sources.memConfig) && '.config/opencode/opencode-mem.jsonc',
  ].filter(Boolean)
  const missing = mustContain.filter((f) => !listing.includes(f))
  if (missing.length) {
    rmSync(archive, { force: true })
    throw new Error(`archive failed verification, missing entries: ${missing.join(', ')}`)
  }

  // Rotate: keep the newest KEEP archives.
  const archives = readdirSync(backupDir).filter((f) => f.endsWith('.tar.gz')).sort()
  for (const old of archives.slice(0, Math.max(0, archives.length - KEEP))) {
    rmSync(join(backupDir, old), { force: true })
    rmSync(join(backupDir, old.replace(/\.tar\.gz$/, '.manifest.txt')), { force: true })
  }

  return { archive, listing }
}

function manifestText(sources, ts) {
  const repoSha = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
    } catch {
      return 'n/a'
    }
  })()
  return [
    `tutor-state backup ${ts}`,
    `repo sha: ${repoSha}`,
    `sources: tutorDir=${sources.tutorDir}`,
    `         memData=${sources.memData}`,
    `         memConfig=${sources.memConfig}`,
    'restore (per-source roots, in order):',
    `  tar -xzf <archive> -C ${join(sources.tutorDir, '..')} .tutor`,
    `  tar -xzf <archive> -C ${join(sources.memData, '..', '..')} .opencode-mem/data`,
    `  tar -xzf <archive> -C ${join(sources.memConfig, '..', '..', '..')} .config/opencode/opencode-mem.jsonc`,
    '',
  ].join('\n')
}

function main() {
  const sources = { ...DEFAULT_SOURCES }
  const findings = audit(sources)
  const severityOrder = { info: 0, warn: 1, error: 2 }
  for (const f of findings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])) {
    console.log(`[${f.severity.toUpperCase()}] ${f.message}`)
  }
  if (process.argv.includes('--audit-only')) return

  try {
    const { archive } = backup(sources)
    const size = statSync(archive).size
    console.log(`\nbackup OK: ${archive} (${(size / 1e6).toFixed(1)} MB)`)
    console.log('copy the archive off-box periodically — it is gitignored, not versioned.')
  } catch (e) {
    console.error(`backup FAILED: ${e.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].endsWith('backup-state.mjs')) {
  main()
}
