// Workspace header: a Projects back button + project identity on the left,
// and the primary Test action plus the overflow Project menu on the right.
// Rare/destructive actions live in the menu, not the toolbar.
import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon, SettingsIcon } from '../ui/icons'
import { HistoryDrawer } from '../history/HistoryDrawer'

interface TopBarProps {
  projectName: string
  minecraftVersion: string
  modLoader: string
  packVersion: string
  isTesting: boolean
  onSave: () => void
  onTest: () => void
  onDeployCompanion: () => void
  onExport: () => void
  onDelete: () => void
  onOpenSettings: () => void
  packLoaded: boolean
  onBackToProjects: () => void
  onRefresh: () => void
  onForceReindex: () => void
  onClosePack: () => void
}

export function TopBar({
  projectName,
  minecraftVersion,
  modLoader,
  packVersion,
  isTesting,
  onSave,
  onTest,
  onDeployCompanion,
  onExport,
  onDelete,
  onOpenSettings,
  packLoaded,
  onBackToProjects,
  onRefresh,
  onForceReindex,
  onClosePack,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="workspace-header">
      <div className="workspace-title-cluster">
        <button className="btn-secondary btn-back" onClick={onBackToProjects} title="Back to projects">
          Projects
        </button>
        <h2>{projectName}</h2>
        <span className="workspace-meta">
          MC {minecraftVersion} &bull; {modLoader} &bull; v{packVersion}
        </span>
      </div>
      <div className="workspace-actions">
        <button className="btn-secondary" onClick={onSave} title="Save project metadata">
          Save
        </button>
        <button className="btn-secondary" onClick={onRefresh} title="Re-scan textures, quests, mods, and configs (cache-aware)" disabled={!packLoaded}>
          Refresh
        </button>
        <button
          className={packLoaded ? 'btn-primary' : 'btn-secondary'}
          onClick={onTest}
          disabled={isTesting}
          title={
            packLoaded
              ? 'Launch this pack in Minecraft'
              : 'Launch this pack in Minecraft (load the pack first for texture/quest data)'
          }
        >
          {isTesting ? 'Testing...' : 'Test'}
        </button>
        <button className="btn-secondary" onClick={onOpenSettings} title="Settings (CurseForge API key)" aria-label="Open settings">
          <SettingsIcon size={14} />
        </button>
        <HistoryDrawer />
        <div ref={menuRef} className="project-menu-wrap">
          <button
            className="btn-secondary project-menu-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            Project <ChevronDownIcon size={14} />
          </button>
          {menuOpen && (
            <div className="project-menu" role="menu">
              {packLoaded && (
                <div className="project-menu-group">
                  <div className="project-menu-group-title">Pack</div>
                  <button
                    className="project-menu-item"
                    role="menuitem"
                    onClick={() => { onRefresh(); closeMenu() }}
                  >
                    <span className="project-menu-item-title">Refresh</span>
                    <span className="project-menu-item-desc">Re-scan textures, quests, mods, configs (cache-aware)</span>
                  </button>
                  <button
                    className="project-menu-item"
                    role="menuitem"
                    onClick={() => { onForceReindex(); closeMenu() }}
                  >
                    <span className="project-menu-item-title">Force Full Re-index</span>
                    <span className="project-menu-item-desc">Bypass caches — catches same-size/same-mtime file changes</span>
                  </button>
                  <button
                    className="project-menu-item"
                    role="menuitem"
                    onClick={() => { onClosePack(); closeMenu() }}
                  >
                    <span className="project-menu-item-title">Close Pack</span>
                    <span className="project-menu-item-desc">Unload this instance from the workspace</span>
                  </button>
                </div>
              )}
              <div className="project-menu-group">
                <div className="project-menu-group-title">Setup</div>
                <button
                  className="project-menu-item"
                  role="menuitem"
                  onClick={() => { onDeployCompanion(); closeMenu() }}
                >
                  <span className="project-menu-item-title">Deploy Companion</span>
                  <span className="project-menu-item-desc">Install the companion mod into the instance</span>
                </button>
              </div>
              <div className="project-menu-group">
                <div className="project-menu-group-title">Share</div>
                <button
                  className="project-menu-item"
                  role="menuitem"
                  onClick={() => { onExport(); closeMenu() }}
                >
                  <span className="project-menu-item-title">Export Modpack...</span>
                  <span className="project-menu-item-desc">Build a .mrpack or CurseForge zip</span>
                </button>
              </div>
              <div className="project-menu-separator" />
              <button
                className="project-menu-item danger"
                role="menuitem"
                onClick={() => { onDelete(); closeMenu() }}
              >
                <span className="project-menu-item-title">Delete Project...</span>
                <span className="project-menu-item-desc">Permanently remove this project</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
