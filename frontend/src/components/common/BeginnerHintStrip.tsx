import { usePackHealth } from './PackHealthProvider'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { deriveCoachSteps, type CoachJumpTab, type CoachStepState } from '../../core/beginner/steps'
import type { ConnectionSignals } from '../../services/connection-status'

export interface BeginnerHintStripProps {
  connection: ConnectionSignals
  onJumpToTab: (tab: 'quests' | 'health') => void
}

const STEP_BUTTON_LABEL: Record<CoachJumpTab, string> = {
  quests: 'Open Quests',
  health: 'Open Health',
}

const STATE_LABEL: Record<Exclude<CoachStepState, 'do'>, string> = {
  good: 'Good',
  attention: 'Needs a look',
}

/**
 * The Beginner Mode coach (s53): a hint strip showing the wedge journey —
 * follow the guide → save → fix what Pack Health found → launch. States are
 * derived purely from real signals (the Pack Health report + the connection
 * pill); the guide and save steps point at surfaces and never claim
 * completion. Rendered only when Beginner Mode is on (see ProjectWorkspace).
 */
export function BeginnerHintStrip({ connection, onJumpToTab }: BeginnerHintStripProps) {
  const { report } = usePackHealth()
  const questGraph = usePackHealthStore((s) => s.questGraph)
  const steps = deriveCoachSteps({ report, connection, questGraph })

  return (
    <div className="beginner-hint-strip" data-testid="beginner-hint-strip" aria-label="Your first pack">
      {steps.map((step, i) => {
        const jumpTab = step.jumpTab
        return (
          <div key={step.id} className={`beginner-hint-step ${step.state}`}>
            <div className="beginner-hint-step-head">
              <span className="beginner-hint-step-num">{i + 1}</span>
              <span className="beginner-hint-step-title">{step.title}</span>
            </div>
            <p className="beginner-hint-step-copy">{step.copy}</p>
            <div className="beginner-hint-step-foot">
              {jumpTab && (
                <button
                  className="beginner-hint-step-btn"
                  onClick={() => onJumpToTab(jumpTab)}
                >
                  {STEP_BUTTON_LABEL[jumpTab]}
                </button>
              )}
              {step.state !== 'do' && (
                <span className={`beginner-hint-state ${step.state}`}>
                  {STATE_LABEL[step.state]}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
