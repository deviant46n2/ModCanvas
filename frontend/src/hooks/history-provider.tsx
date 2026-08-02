// Shared, app-wide history provider.
//
// Owns a single `HistoryStore` per active project, wires Ctrl+Z / Ctrl+Y to a
// global undo/redo, and persists the journal (debounced) so history survives
// restarts. Editors register an apply handler per subject; when a history step
// targets that subject, the handler re-applies the before/after snapshot to the
// live state. Ordering is strictly chronological across tools by design.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  HistoryStore,
  type HistoryEntry,
  type HistorySubject,
  type CommittedEntry,
} from '../core/history/store'
import { encodeJournal, parseJournal } from '../core/history/journal'
import { readHistoryJournal, writeHistoryJournal } from '../services/history'

type ApplyHandler = (entry: CommittedEntry, direction: 'before' | 'after') => void

export interface HistoryRoute {
  /** Persist the restored snapshot to canonical storage (backend/disk). */
  restore?: (entry: CommittedEntry, direction: 'before' | 'after') => void
  /** Switch the active surface to the one that owns this subject. */
  navigate?: () => void
}

export interface HistoryApi {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  /** Top entry that would be undone next (for button/toolbar visibility). */
  peekUndo: CommittedEntry | null
  commit: (entry: HistoryEntry, opts?: { split?: boolean }) => void
  undo: () => void
  redo: () => void
  /** Register an apply handler for a subject; returns an unregister fn. */
  register: (subject: HistorySubject, handler: ApplyHandler) => () => void
  /** Register routing (persist + navigate) for a subject; unregister on cleanup. */
  registerRoute: (subject: HistorySubject, route: HistoryRoute) => () => void
  /** Time-travel the present cursor to a history index, applying every step. */
  jumpTo: (presentIndex: number) => void
  /** Switch the store to a project (loads its journal, resets on change). */
  attachProject: (projectId: string | null) => void
  /** Latest snapshot for a history drawer. */
  historyItems: { items: CommittedEntry[]; present: number }
}

const HistoryContext = createContext<HistoryApi | null>(null)

const PERSIST_DEBOUNCE_MS = 500

export function useHistory(): HistoryApi {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('useHistory must be used within <HistoryProvider>')
  return ctx
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef(new HistoryStore())
  const handlersRef = useRef(new Map<HistorySubject, ApplyHandler>())
  const routesRef = useRef(new Map<HistorySubject, HistoryRoute>())
  const projectRef = useRef<string | null>(null)
  const persistTimer = useRef<number | undefined>(undefined)
  const [version, setVersion] = useState(0)

  const schedulePersist = useCallback(() => {
    if (persistTimer.current !== undefined) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      const pid = projectRef.current
      if (!pid) return
      const content = encodeJournal(storeRef.current.exportJournal())
      writeHistoryJournal(pid, content).catch(() => {
        // Journal is best-effort; a failed write must never break editing.
      })
    }, PERSIST_DEBOUNCE_MS)
  }, [])

  // Apply a popped entry: in-memory handler first (instant), then canonical
  // restore (backend/disk), then navigate to the owning surface so a reload
  // shows the restored state even when the editor was unmounted.
  const apply = useCallback((entry: CommittedEntry, direction: 'before' | 'after') => {
    handlersRef.current.get(entry.subject)?.(entry, direction)
    routesRef.current.get(entry.subject)?.restore?.(entry, direction)
    routesRef.current.get(entry.subject)?.navigate?.()
  }, [])

  const commit = useCallback((entry: HistoryEntry, opts?: { split?: boolean }) => {
    storeRef.current.commit(entry, opts)
    schedulePersist()
    setVersion((v) => v + 1)
  }, [schedulePersist])

  const undo = useCallback(() => {
    const entry = storeRef.current.undo()
    if (entry) apply(entry, 'before')
    schedulePersist()
    setVersion((v) => v + 1)
  }, [apply, schedulePersist])

  const redo = useCallback(() => {
    const entry = storeRef.current.redo()
    if (entry) apply(entry, 'after')
    schedulePersist()
    setVersion((v) => v + 1)
  }, [apply, schedulePersist])

  const jumpTo = useCallback((presentIndex: number) => {
    const { undoSteps, redoSteps } = storeRef.current.jumpTo(presentIndex)
    for (const entry of undoSteps) apply(entry, 'before')
    for (const entry of redoSteps) apply(entry, 'after')
    schedulePersist()
    setVersion((v) => v + 1)
  }, [apply, schedulePersist])

  const register = useCallback((subject: HistorySubject, handler: ApplyHandler) => {
    handlersRef.current.set(subject, handler)
    return () => {
      handlersRef.current.delete(subject)
    }
  }, [])

  const registerRoute = useCallback((subject: HistorySubject, route: HistoryRoute) => {
    routesRef.current.set(subject, route)
    return () => {
      routesRef.current.delete(subject)
    }
  }, [])

  const attachProject = useCallback((projectId: string | null) => {
    if (projectId === projectRef.current) return
    projectRef.current = projectId
    storeRef.current = new HistoryStore()
    handlersRef.current.clear()
    routesRef.current.clear()
    setVersion((v) => v + 1)
    if (!projectId) return
    readHistoryJournal(projectId)
      .then((text) => {
        if (projectRef.current !== projectId) return
        storeRef.current.loadJournal(parseJournal(text))
        setVersion((v) => v + 1)
      })
      .catch(() => {
        // No journal yet is fine; history starts empty.
      })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const api = useMemo<HistoryApi>(() => {
    const store = storeRef.current
    const peek = store.peekUndo()
    return {
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoDepth: store.undoDepth,
      peekUndo: peek ? { ...peek } : null,
      commit,
      undo,
      redo,
      jumpTo,
      register,
      registerRoute,
      attachProject,
      historyItems: store.snapshot(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, commit, undo, redo, jumpTo, register, registerRoute, attachProject])

  return <HistoryContext.Provider value={api}>{children}</HistoryContext.Provider>
}