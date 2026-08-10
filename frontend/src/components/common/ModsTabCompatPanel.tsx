// The compatibility-check results panel: issue list with one-click installs
// for resolved missing dependencies, plus the batch "install all missing"
// action. Extracted from ModsTab (the 300-line rule).

import type {
  CompatibilityResult,
  CompatibilityInstall,
} from '../../services/types'

export interface ModsTabCompatPanelProps {
  result: CompatibilityResult
  onClose: () => void
  onInstallMissing: (install: CompatibilityInstall) => Promise<void>
  installingMissing: Set<string>
  onInstallAllMissing: () => Promise<void>
}

export function ModsTabCompatPanel({
  result,
  onClose,
  onInstallMissing,
  installingMissing,
  onInstallAllMissing,
}: ModsTabCompatPanelProps) {
  return (
    <div className={`compat-panel ${result.compatible ? 'compatible' : 'has-issues'}`}>
      <div className="compat-header">
        <span className="compat-status">
          {result.compatible ? 'All checks passed' : `${result.issues.length} issue(s) found`}
        </span>
        {result.issues.some((i) => i.install) && (
          <button
            className="btn-secondary btn-sm"
            onClick={onInstallAllMissing}
            disabled={installingMissing.size > 0}
          >
            {installingMissing.size > 0
              ? `Installing ${installingMissing.size}...`
              : 'Install all missing'}
          </button>
        )}
        <button className="btn-close" onClick={onClose} aria-label="Close compatibility results">{'\u00D7'}</button>
      </div>
      {result.issues.length > 0 && (
        <div className="compat-issues">
          {result.issues.map((issue, i) => (
            <div key={i} className={`compat-issue ${issue.severity.toLowerCase()}`}>
              <span className="issue-severity">{issue.severity}</span>
              <span className="issue-message">{issue.message}</span>
              <span className="issue-mods">
                {issue.affected_mod_names.join(' \u2194 ')}
              </span>
              {issue.install && (
                <button
                  className="btn-primary btn-sm"
                  onClick={() => onInstallMissing(issue.install!)}
                  disabled={installingMissing.has(issue.install!.mod_id)}
                >
                  {installingMissing.has(issue.install!.mod_id) ? 'Installing…' : 'Install'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="compat-warnings">
          {result.warnings.map((warn, i) => (
            <div key={i} className="compat-warning">{warn}</div>
          ))}
        </div>
      )}
    </div>
  )
}
