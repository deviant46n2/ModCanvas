import type { LoadPackProgress } from '../../services/api'
import { useEffect } from 'react'

interface LoadPackModalProps {
  show: boolean
  onClose: () => void
  progress: LoadPackProgress
}

const stageLabels: Record<LoadPackProgress['stage'], string> = {
  idle: 'Waiting...',
  textures: 'Indexing Textures',
  quests: 'Importing FTB Quests',
  mods: 'Loading Mods & Configs',
  recipes: 'Loading Recipes',
  complete: 'Complete',
  error: 'Error',
}

const stageDetails: Record<LoadPackProgress['stage'], string[]> = {
  idle: ['Preparing...'],
  textures: [
    'Scanning JAR files in mods/ folder',
    'Extracting textures from mod JARs',
    'Scanning kubejs/assets for runtime textures',
    'Building texture index...'
  ],
  quests: [
    'Locating FTB Quests data files',
    'Parsing chapter and quest SNBT files',
    'Loading language files for chapter titles',
    'Building quest dependency graph',
    'Saving quest database...'
  ],
  mods: [
    'Scanning instance mods folder',
    'Reading mod metadata',
    'Loading mod dependencies',
    'Loading config files...'
  ],
  recipes: [
    'Scanning mod jars for recipes',
    'Reading vanilla / KubeJS / CraftTweaker recipes',
    'Loading recipes into the editor...'
  ],
  complete: ['Ready!'],
  error: ['An error occurred during loading']
}

function getDetailForProgress(stage: LoadPackProgress['stage'], progress: number): string {
  const details = stageDetails[stage] || []
  const idx = Math.min(Math.floor((progress / 100) * details.length), details.length - 1)
  return details[Math.max(0, idx)]
}

function Spinner({ size = 24 }: { size?: number }) {
  useEffect(() => {
    // Inject keyframes if not present
    if (!document.getElementById('spinner-keyframes')) {
      const style = document.createElement('style')
      style.id = 'spinner-keyframes'
      style.textContent = `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner-svg { animation: spin 1s linear infinite; }
      `
      document.head.appendChild(style)
    }
  }, [])
  
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spinner-svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  )
}

export function LoadPackModal({ show, onClose, progress }: LoadPackModalProps) {
  if (!show) return null

  const isError = progress.stage === 'error'
  const isComplete = progress.stage === 'complete'
  const isLoading = !isError && !isComplete
  const detail = getDetailForProgress(progress.stage, progress.progress)
  const hasFileProgress = progress.file || (progress.done !== undefined && progress.total !== undefined)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal load-pack-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="load-pack-title">
        <div className="modal-header">
          <h2 id="load-pack-title">
            {isError ? 'Load Failed' : isComplete ? 'Pack Loaded' : 'Loading Modpack'}
          </h2>
        </div>
        <div className="modal-body">
          <div className="load-pack-progress">
            <div className="stage-info">
              <span className="stage-label">{stageLabels[progress.stage]}</span>
              <span className="stage-message">{progress.message}</span>
              {isLoading && <span className="stage-detail">{detail}</span>}
              {isLoading && hasFileProgress && (
                <div className="stage-file">
                  <span className="stage-file-count">
                    {progress.done !== undefined && progress.total !== undefined
                      ? `${progress.done} / ${progress.total} · `
                      : ''}
                    {progress.file ? `Processing ${progress.file}` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progress.progress}%` }}
                role="progressbar"
                aria-valuenow={progress.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="progress-percent">{progress.progress}%</div>
            {isLoading && <Spinner size={20} />}
          </div>

          {isError && progress.error && (
            <div className="error-details">
              <pre>{progress.error}</pre>
              <button className="btn-secondary" onClick={onClose}>Dismiss</button>
            </div>
          )}

          {isComplete && (
            <div className="success-message">
              <p>Modpack loaded successfully!</p>
              <p className="hint">You can now navigate to Quests, Progression, Recipes, and Configs tabs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}