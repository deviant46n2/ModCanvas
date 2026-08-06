import { useState, useEffect, useCallback } from 'react'
import { testProject, deployCompanionMod, wsIpcRestart } from '../services/api'
import { globalAssetCache } from '../services/asset-cache'
import { onCompanionEvent } from '../services/companion-socket'
import type { Project } from './useProjectState'

export function useLaunchState(selectedProject: Project | null) {
  const [testProgress, setTestProgress] = useState('')
  const [testError, setTestError] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [deployCompanionMessage, setDeployCompanionMessage] = useState('')

  // Companion frames arrive over the socket. The connection pill state itself
  // lives in useConnectionPill (per open project); this hook only handles
  // frames that trigger work (ASSETS_READY).
  useEffect(() => {
    const unsubEvent = onCompanionEvent((frame) => {
      console.log('[ModCanvas] Received WebSocket event from Minecraft:', frame.event, frame)

      if (frame.event === 'ASSETS_READY' && frame.payload) {
        globalAssetCache.processAssetsReady(frame.payload).catch((err: unknown) => {
          console.error('[ModCanvas] Failed to process assets:', err)
        })
      }
    })

    return () => {
      unsubEvent()
    }
  }, [])

  const restartWebSocket = useCallback(async () => {
    try {
      await wsIpcRestart()
    } catch (e) {
      console.error('[ModCanvas] ws_ipc_restart failed:', e)
    }
  }, [])

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
    deployCompanionMessage,
    handleTestProject,
    handleDeployCompanion,
    restartWebSocket,
  }
}
