import { useState, useRef, useEffect, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { testProject, deployCompanionMod, wsIpcGetStatus, wsIpcRestart, type WsConnectionStatus } from '../services/api'
import { globalAssetCache } from '../services/asset-cache'
import type { Project } from './useProjectState'

export function useLaunchState(selectedProject: Project | null) {
  const [testProgress, setTestProgress] = useState('')
  const [testError, setTestError] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>({ connected: false, client_count: 0, port: 9876 })
  const [deployCompanionMessage, setDeployCompanionMessage] = useState('')
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const setupWsListeners = async () => {
      const unlistenWsStatus = await listen<WsConnectionStatus>('ws-ipc:status', (event) => {
        setWsStatus(event.payload)
      })
      const unlistenWsEvent = await listen('ws-ipc:event', (event) => {
        const payload = event.payload as Record<string, unknown> | undefined
        const eventType = payload?.event as string | undefined
        console.log('[ModCanvas] Received WebSocket event from Minecraft:', eventType, payload)

        if (eventType === 'ASSETS_READY' && payload?.payload) {
          globalAssetCache.processAssetsReady(payload.payload).catch((err: unknown) => {
            console.error('[ModCanvas] Failed to process assets:', err)
          })
        }
      })

      const currentStatus = await wsIpcGetStatus()
      if (!cancelled) setWsStatus(currentStatus)

      return () => {
        unlistenWsStatus()
        unlistenWsEvent()
      }
    }

    let cancelled = false
    setupWsListeners().then(cleanup => {
      if (cancelled) { cleanup() } else { unlistenRef.current = cleanup }
    })

    return () => {
      cancelled = true
      unlistenRef.current?.()
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
