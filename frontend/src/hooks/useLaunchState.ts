import { useState, useEffect, useCallback } from 'react'
import { testProject, deployCompanionMod, wsIpcGetStatus, wsIpcRestart, type WsConnectionStatus } from '../services/api'
import { globalAssetCache } from '../services/asset-cache'
import { onCompanionEvent, onCompanionStatus } from '../services/companion-socket'
import type { Project } from './useProjectState'

export function useLaunchState(selectedProject: Project | null) {
  const [testProgress, setTestProgress] = useState('')
  const [testError, setTestError] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>({ connected: false, clientCount: 0, port: 9876 })
  const [deployCompanionMessage, setDeployCompanionMessage] = useState('')

  // Bridge state arrives over the companion socket (CONNECTION_STATUS frames).
  // The Tauri event channel is unreliable on some Linux/WebKitGTK stacks, so
  // it is deliberately NOT the source of truth here.
  useEffect(() => {
    const unsubStatus = onCompanionStatus((status) => {
      setWsStatus({ connected: status.connected, clientCount: status.clientCount, port: status.port })
    })
    const unsubEvent = onCompanionEvent((frame) => {
      console.log('[ModCanvas] Received WebSocket event from Minecraft:', frame.event, frame)

      if (frame.event === 'ASSETS_READY' && frame.payload) {
        globalAssetCache.processAssetsReady(frame.payload).catch((err: unknown) => {
          console.error('[ModCanvas] Failed to process assets:', err)
        })
      }
    })

    // Initial sync for the pill before the first status frame lands.
    wsIpcGetStatus().then((current) => setWsStatus(current)).catch(() => {})

    return () => {
      unsubStatus()
      unsubEvent()
    }
  }, [])

  const refreshWsStatus = useCallback(async () => {
    try {
      setWsStatus(await wsIpcGetStatus())
    } catch (e) {
      console.error('[ModCanvas] ws_ipc_get_status failed:', e)
    }
  }, [])

  const restartWebSocket = useCallback(async () => {
    try {
      await wsIpcRestart()
      await new Promise((resolve) => setTimeout(resolve, 600))
      await refreshWsStatus()
    } catch (e) {
      console.error('[ModCanvas] ws_ipc_restart failed:', e)
    }
  }, [refreshWsStatus])

  async function handleTestProject() {
    if (!selectedProject) return
    setTestError('')
    setIsTesting(true)
    setTestProgress('Preparing test instance...')

    try {
      await testProject(selectedProject.id, 'Player', '2G', '4G')
      setTestProgress('Test instance launched!')
    } catch (e: any) {
      console.error('[ModCanvas] test_project failed:', e)
      setTestError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsTesting(false)
    }
  }

  async function handleDeployCompanion() {
    if (!selectedProject) return
    setDeployCompanionMessage('Deploying...')
    try {
      await deployCompanionMod(selectedProject.id)
      setDeployCompanionMessage('\u2713 Companion mod deployed')
      setTimeout(() => setDeployCompanionMessage(''), 3000)
    } catch (e: any) {
      setDeployCompanionMessage('\u2717 ' + (e?.message || String(e)))
      setTimeout(() => setDeployCompanionMessage(''), 5000)
    }
  }

  return {
    testProgress,
    testError,
    isTesting,
    wsStatus,
    deployCompanionMessage,
    handleTestProject,
    handleDeployCompanion,
    refreshWsStatus,
    restartWebSocket,
  }
}
