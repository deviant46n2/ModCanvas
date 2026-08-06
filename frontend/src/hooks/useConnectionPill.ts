import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { companionState, onCompanionStatus } from '../services/companion-socket'
import {
  connectionStateView,
  type ConnectionSignals,
  type ConnectionStateView,
} from '../services/connection-status'

interface PrismInstance {
  id: string
  name: string
  mc_version: string
  loader: string
  game_dir: string
  status: string
}

interface CompanionDeployStatus {
  deployed: boolean
  stale: boolean
}

const POLL_MS = 5000

/**
 * Derives the connection pill state for the open project.
 *
 * Companion presence comes from the hub socket (push); deployment and
 * instance status are polled while it matters. Instance status only ever
 * reflects instances launched from ModCanvas — external launches are not
 * tracked and never claimed.
 */
export function useConnectionPill(
  project: { id: string; path: string } | null,
): { view: ConnectionStateView; signals: ConnectionSignals } {
  const [signals, setSignals] = useState<ConnectionSignals>({
    serverUp: false,
    companionConnected: false,
    deployed: false,
    stale: false,
    instanceRunning: false,
  })

  useEffect(() => {
    if (!project) return
    let disposed = false

    const unsubStatus = onCompanionStatus((status) => {
      if (!disposed) setSignals((prev) => ({ ...prev, companionConnected: status.connected }))
    })

    const refresh = () => {
      setSignals((prev) => ({ ...prev, serverUp: companionState.serverUp }))
      invoke<CompanionDeployStatus>('get_project_companion_status', { projectId: project.id })
        .then((d) => {
          if (!disposed) setSignals((prev) => ({ ...prev, deployed: d.deployed, stale: d.stale }))
        })
        .catch(() => {})
      invoke<PrismInstance[]>('list_mc_instances')
        .then((insts) => {
          const inst = insts.find((i) => i.game_dir === project.path)
          if (!disposed) setSignals((prev) => ({ ...prev, instanceRunning: inst?.status === 'Running' }))
        })
        .catch(() => {})
    }

    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
      unsubStatus()
    }
  }, [project])

  return { view: connectionStateView(signals), signals }
}
