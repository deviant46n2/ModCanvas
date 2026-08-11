// GuidedConfigWizard — the P0-MINIWIZ "Add a config tweak" surface (roadmap §9.5).
//
// A three-step, task-scoped guide over the config editor: pick a config file →
// search a setting by plain words → edit its value as a typed form. The Apply
// step routes through the editor's own updateConfigValue + saveConfigFile
// (history + save_structured_config) — the wizard operates the same editor
// state, no parallel generation.
import { useMemo, useState } from 'react'
import type { ConfigFileInfo } from '../../core/config/types'
import { findMatchingPaths, getAt } from '../../core/config/tree'
import type { ConfigValue } from '../../core/config/types'
import { ConfigStringField, ConfigNumberField, ConfigBooleanField, ConfigEnumField, ConfigColorField } from './config-editor/fields'
import './guided-config-wizard.css'

export interface GuidedConfigTarget {
  /** Config file path (must already be open/parsed). */
  filePath: string
  /** Dot path of the setting, e.g. ["general", "keepInventory"]. */
  path: string[]
  /** New value to write. */
  value: ConfigValue
}

// The parser only produces a searchable tree for these extensions; anything
// else (quest .snbt, kubejs .js, crafttweaker .zs, Forge .cfg, …) parses to a
// single raw string and can never match a setting. Step 1 filters on the
// extension (the parse truth) — never on the displayed format label, which
// calls .cfg "Properties" while the parser treats it as raw.
const SEARCHABLE_EXTS = new Set(['toml', 'json', 'yaml', 'yml', 'properties'])
const extOf = (f: ConfigFileInfo) => f.path.split('.').pop()?.toLowerCase() ?? ''
const isSearchable = (f: ConfigFileInfo) => SEARCHABLE_EXTS.has(extOf(f))

interface GuidedConfigWizardProps {
  open: boolean
  configFiles: ConfigFileInfo[]
  /** The currently open, parsed config (only this one is searchable — the
   *  editor parses one file at a time; the wizard never parses on its own). */
  openFilePath: string | null
  openRoot: ConfigValue | null
  /** Open a config file (editor's own path). */
  onOpenFile: (file: ConfigFileInfo) => void
  /** Apply an edit through the editor's own update + save path. */
  onApply: (target: GuidedConfigTarget) => void
  onClose: () => void
}

export function GuidedConfigWizard({ open, configFiles, openFilePath, openRoot, onOpenFile, onApply, onClose }: GuidedConfigWizardProps) {
  const [step, setStep] = useState(1)
  const [fileQuery, setFileQuery] = useState('')
  const [settingQuery, setSettingQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null)
  const [draftValue, setDraftValue] = useState<ConfigValue | null>(null)

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase()
    const searchable = configFiles.filter(isSearchable)
    if (!q) return searchable
    return searchable.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
    )
  }, [configFiles, fileQuery])

  const rawOnlyFiles = useMemo(() => configFiles.filter((f) => !isSearchable(f)), [configFiles])
  const rawOnlyCount = rawOnlyFiles.length

  const matches = useMemo(() => {
    if (!openRoot || !settingQuery.trim()) return []
    return findMatchingPaths(openRoot, settingQuery)
      .filter((p) => p.length > 0)
      .slice(0, 50)
  }, [openRoot, settingQuery])

  const selectedValue = selectedPath && openRoot ? getAt(openRoot, selectedPath) : null
  const displayValue = draftValue ?? selectedValue

  if (!open) return null

  const openFile = configFiles.find((f) => f.path === openFilePath)

  const handlePickFile = (file: ConfigFileInfo) => {
    onOpenFile(file)
    setStep(2)
  }

  const handlePickSetting = (path: string[]) => {
    setSelectedPath(path)
    setStep(3)
  }

  const handleValueChange = (path: string[], value: ConfigValue) => {
    setSelectedPath(path)
    // Keep the in-wizard value in sync; Apply persists via the editor path.
    setDraftValue(value)
  }

  const handleApply = () => {
    if (!openFilePath || !selectedPath || !displayValue) return
    onApply({
      filePath: openFilePath,
      path: selectedPath,
      value: displayValue,
    })
    reset()
    onClose()
  }

  const reset = () => {
    setStep(1)
    setFileQuery('')
    setSettingQuery('')
    setSelectedPath(null)
    setDraftValue(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <div className="guided-config-overlay" onClick={handleClose}>
      <div className="guided-config" onClick={(e) => e.stopPropagation()}>
        <div className="guided-config-header">
          <strong>Add a config tweak</strong>
          <span>Step {step} of 3</span>
          <button className="guided-config-close" onClick={handleClose} aria-label="Close">×</button>
        </div>

        {step === 1 && (
          <div className="guided-config-step">
            <p className="guided-config-hint">Which config file has the setting you want to change?</p>
            {filteredFiles.length === 0 ? (
              rawOnlyCount === configFiles.length ? (
                <p className="guided-config-hint">
                  No config files here have searchable settings — quest data, scripts and custom formats are raw text.
                  {' '}Raw-only files (open them in the configs tab and edit in Raw mode): {configFiles.slice(0, 8).map((f) => f.name).join(', ')}{configFiles.length > 8 ? ` and ${configFiles.length - 8} more.` : '.'}
                  {' '}If this is a fresh pack, launch it once and join a world — the mods write their real configs on first boot, and they will show up here as searchable.
                </p>
              ) : (
                <p className="guided-config-hint">No searchable config files match.</p>
              )
            ) : (
              <>
                <input
                  type="text"
                  className="guided-config-search"
                  placeholder="Search config files…"
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                />
                <div className="guided-config-files">
                  {filteredFiles.map((f) => (
                    <button key={f.path} className="guided-config-file" onClick={() => handlePickFile(f)}>
                      <span>{f.name}</span>
                      <em>{f.format}</em>
                    </button>
                  ))}
                </div>
                {rawOnlyCount > 0 && (
                  <p className="guided-config-hint guided-config-rawonly">
                    {rawOnlyCount} other file{rawOnlyCount === 1 ? '' : 's'} ({rawOnlyFiles.slice(0, 8).map((f) => f.name).join(', ')}{rawOnlyCount > 8 ? ' …' : ''}) have no searchable settings — raw text only.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="guided-config-step">
            {openFile && !openRoot ? (
              <p className="guided-config-hint">
                <strong>{openFile.name}</strong> has no searchable settings — it opened in Raw mode (unparseable as
                structured config). Close the wizard and edit it in the configs tab's Raw mode instead.
              </p>
            ) : (
              <>
                <p className="guided-config-hint">
                  {openFile ? <><strong>{openFile.name}</strong> — search a setting by plain words.</> : 'Open a config file first.'}
                </p>
                <input
                  type="text"
                  className="guided-config-search"
                  placeholder="e.g. keep inventory, difficulty, tps…"
                  value={settingQuery}
                  onChange={(e) => setSettingQuery(e.target.value)}
                  autoFocus
                />
                <div className="guided-config-matches">
                  {settingQuery.trim() && matches.length === 0 && (
                    <p className="guided-config-hint">No settings match “{settingQuery}”.</p>
                  )}
                  {matches.map((path) => (
                    <button key={path.join('.')} className="guided-config-match" onClick={() => handlePickSetting(path)}>
                      {path.join(' › ')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && selectedPath && displayValue && (
          <div className="guided-config-step">
            <p className="guided-config-hint">
              Set <strong>{selectedPath.join(' › ')}</strong>
              {displayValue.comment && <span className="guided-config-comment"> — {displayValue.comment}</span>}
            </p>
            <div className="guided-config-editor">
              <ConfigLeaf
                path={selectedPath}
                value={displayValue}
                onChange={handleValueChange}
              />
            </div>
          </div>
        )}

        <div className="guided-config-actions">
          {step > 1 && <button className="btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
          {step === 3 && (
            <button className="btn-primary" onClick={handleApply} disabled={!displayValue}>
              Apply tweak
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfigLeaf({ path, value, onChange }: { path: string[]; value: ConfigValue; onChange: (path: string[], v: ConfigValue) => void }) {
  const label = path[path.length - 1]
  const noopControls = null
  const base = { path, label, depth: 0, onChange, controls: noopControls }
  switch (value.type) {
    case 'string': return <ConfigStringField {...base} value={value} />
    case 'number': return <ConfigNumberField {...base} value={value} />
    case 'boolean': return <ConfigBooleanField {...base} value={value} />
    case 'enum': return <ConfigEnumField {...base} value={value} />
    case 'color': return <ConfigColorField {...base} value={value} />
    default: return null
  }
}
