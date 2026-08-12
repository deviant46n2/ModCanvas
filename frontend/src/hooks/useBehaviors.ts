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

  /** Save the working list. Returns ok/error so the UI can show the result
   *  honestly — never a silent claim of success. */
  const save = useCallback(async (): Promise<SaveResult> => {
    try {
      await saveBehaviors(projectId, state.behaviors)
      savedRef.current = state.behaviors
      setState((s) => ({ ...s, dirty: false }))
      return { ok: true, error: null }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, [projectId, state.behaviors])

  /** Compile one behavior for preview — pure, never writes. */
  const compile = useCallback(
    (behavior: Behavior): Promise<CompileOutput> => compileBehavior(behavior),
    [],
  )

  return { ...state, setBehaviors, save, compile, reload: load }
}
