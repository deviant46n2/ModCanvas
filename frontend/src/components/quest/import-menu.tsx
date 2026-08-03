// Import dropdown for the quest toolbar: consolidates the FTB Quests import
// sources (project directory, Prism Launcher instances, arbitrary directory)
// into a single menu with a sub-view for instance selection.
import { useState, useEffect, useRef } from 'react'
import { DownloadIcon } from '../ui/icons'
import type { PrismInstance } from '../../services/api'

interface ImportMenuProps {
  instances: PrismInstance[] | null
  loading: boolean
  onImportProject: () => void
  onImportPrism: (instance: PrismInstance) => void
  onBrowseOther: () => void
  onLoadInstances: () => void
}

export function ImportMenu({ instances, loading, onImportProject, onImportPrism, onBrowseOther, onLoadInstances }: ImportMenuProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'root' | 'prism'>('root')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setView('root')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    setOpen(v => !v)
    setView('root')
  }
  const close = () => {
    setOpen(false)
    setView('root')
  }

  return (
    <div ref={ref} className="import-menu-wrap">
      <button
        className="book-btn"
        onClick={toggle}
        title="Import FTB Quests data"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DownloadIcon size={14} /> Import
      </button>
      {open && (
        <div className="import-menu" role="menu">
          {view === 'root' ? (
            <>
              <button className="import-menu-item" role="menuitem" onClick={() => { onImportProject(); close() }}>
                <span className="import-menu-item-title">From Project Directory</span>
                <span className="import-menu-item-desc">Re-read FTB Quests data in the open project</span>
              </button>
              <button className="import-menu-item" role="menuitem" onClick={() => { setView('prism'); onLoadInstances() }}>
                <span className="import-menu-item-title">From Prism Launcher…</span>
                <span className="import-menu-item-desc">Pick a modpack instance to scan</span>
              </button>
              <button className="import-menu-item" role="menuitem" onClick={() => { onBrowseOther(); close() }}>
                <span className="import-menu-item-title">Browse Other Directory…</span>
                <span className="import-menu-item-desc">Choose any folder containing FTB Quests data</span>
              </button>
            </>
          ) : (
            <>
              <div className="import-menu-header">
                <button className="import-menu-back" onClick={() => setView('root')}>Back</button>
                <span>Prism Launcher instances</span>
              </div>
              {loading && <div className="import-menu-empty">Loading instances…</div>}
              {!loading && (!instances || instances.length === 0) && (
                <div className="import-menu-empty">No Prism instances found</div>
              )}
              {!loading && instances?.map((inst) => (
                <button
                  key={inst.path}
                  className="import-menu-item"
                  role="menuitem"
                  onClick={() => { onImportPrism(inst); close() }}
                >
                  <span className="import-menu-item-title">{inst.name}</span>
                  <span className="import-menu-item-desc">{inst.path}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
