import { useCallback, useEffect, useRef, useState } from 'react'
import {
  compileBehavior,
  listBehaviors,
  saveBehaviors,
  type Behavior,
  type CompileOutput,
} from '../services/behavior'

interface BehaviorsState {
  loading: boolean
  error: string | null
  behaviors: Behavior[]
  /** True once the working list diverges from the last saved list. */
  dirty: boolean
}

interface SaveResult {
  ok: boolean
  error: string | null
  /** Behaviors that did NOT ship to the instance (`id: reason`). Empty = all. */
  emitFailures: string[]
  /** Behaviors that shipped WITH deterministic notes (`id: note`). These
   *  reached the instance — NOT failures; the UI must say so, not claim
   *  "did not reach the instance" (s46 warning-vs-failure fix). */
  warnings: string[]
}

/**
 * Behavior store hook: mediates the three behavior commands with the same
 * honesty discipline as the other tabs — loading / error / loaded states, no
 * fake rows, no silent save. Full-list semantics match the Rust store: the
 * frontend owns the working list and saves it wholesale; partial authoring
 * is always saveable (validation is the compiler's job, surfaced via
 * compileBehavior, never a save blocker).
 */
export function useBehaviors(projectId: string) {
  const [state, setState] = useState<BehaviorsState>({
    loading: true,
    error: null,
    behaviors: [],
    dirty: false,
  })
  const savedRef = useRef<Behavior[]>([])

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const behaviors = await listBehaviors(projectId)
      savedRef.current = behaviors
      setState({ loading: false, error: null, behaviors, dirty: false })
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: String(e),
      }))
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  /** Replace the working list locally (editor edits). Marks dirty when it
   *  diverges from the last saved list. */
  const setBehaviors = useCallback((behaviors: Behavior[]) => {
    setState((s) => ({
      ...s,
      behaviors,
      dirty: JSON.stringify(behaviors) !== JSON.stringify(savedRef.current),
    }))
  }, [])

  /** Save the working list + write the compiled script into the instance.
   *  Returns ok/error plus the behaviors that failed to emit — the UI shows
   *  those honestly: a saved behavior that never reached the game is a
   *  silent failure otherwise. */
  const save = useCallback(async (): Promise<SaveResult> => {
    try {
      const outcome = await saveBehaviors(projectId, state.behaviors)
      savedRef.current = state.behaviors
      setState((s) => ({ ...s, dirty: false }))
      return {
        ok: true,
        error: null,
        emitFailures: outcome.emit_failures ?? [],
        warnings: outcome.warnings ?? [],
      }
    } catch (e) {
      return { ok: false, error: String(e), emitFailures: [], warnings: [] }
    }
  }, [projectId, state.behaviors])

  /** Compile one behavior for preview — pure, never writes. */
  const compile = useCallback(
    (behavior: Behavior): Promise<CompileOutput> => compileBehavior(behavior),
    [],
  )

  return { ...state, setBehaviors, save, compile, reload: load }
}
