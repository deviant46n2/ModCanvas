import { useState, useEffect, useCallback, useRef } from 'react'
import { testProject, deployCompanionMod, wsIpcRestart } from '../services/api'
import { wsIpcSendEvent } from '../services/ipc'
import { globalAssetCache } from '../services/asset-cache'
import { onCompanionEvent } from '../services/companion-socket'
import { isInstanceRunning, waitForInstanceExit } from '../services/restart-instance'
import type { Project } from './useProjectState'

const STOP_TIMEOUT_MS = 120_000

export function useLaunchState(selectedProject: Project | null) {
  const [testProgress, setTestProgress] = useState('')
  const [testError, setTestError] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [deployCompanionMessage, setDeployCompanionMessage] = useState('')

  // Companion frames arrive over the socket. The connection pill state itself
  // lives in useConnectionPill (per open project); this hook only handles
  // frames that trigger work (ASSETS_READY, RESTART_INSTANCE).
  //
  // The restart handler is kept in a ref so the effect can subscribe once
  // without closing over a stale handleRestartInstance/selectedProject.
  const restartRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    restartRef.current = () => {
      void handleRestartInstance()
    }
  })

  useEffect(() => {
    const unsubEvent = onCompanionEvent((frame) => {
      console.log('[ModCanvas] Received WebSocket event from Minecraft:', frame.event, frame)

      if (frame.event === 'ASSETS_READY' && frame.payload) {
        globalAssetCache.processAssetsReady(frame.payload).catch((err: unknown) => {
          console.error('[ModCanvas] Failed to process assets:', err)
        })
      }

      // Tool trigger path: an external client (restart-instance.mjs) sends
      // RESTART_INSTANCE; the hub routes it to this app peer. Same
      // orchestration as the status-bar Restart button.
      if (frame.event === 'RESTART_INSTANCE') {
        restartRef.current?.()
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

  /** Restart the running instance: stop the game (via the companion), wait
   *  for it to exit, then relaunch through the normal Test path (which
   *  re-deploys the companion mod, so a fresh jar takes effect). */
  async function handleRestartInstance() {
    if (!selectedProject || isRestarting) return
    setTestError('')
    setTestProgress('')
    setIsRestarting(true)
    try {
      const running = await isInstanceRunning(selectedProject.path)
      if (running) {
        setTestProgress('Stopping game...')
        // ws_ipc_send_event returns how many companion peers received the
        // frame. Zero means the companion is not attached — the game cannot
        // be told to stop, so fail fast instead of waiting out the timeout.
        const delivered = await wsIpcSendEvent('STOP_INSTANCE')
        if (delivered === 0) {
          throw new Error(
            'Companion not connected — cannot stop the game remotely. ' +
              'Close it manually, then relaunch.',
          )
        }
        setTestProgress('Waiting for the game to exit...')
        await waitForInstanceExit(() => isInstanceRunning(selectedProject.path), STOP_TIMEOUT_MS)
      }
      setTestProgress('Relaunching instance...')
      await handleTestProject()
    } catch (e: any) {
      console.error('[ModCanvas] restart_instance failed:', e)
      setTestError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsRestarting(false)
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
    isRestarting,
    deployCompanionMessage,
    handleTestProject,
    handleRestartInstance,
    handleDeployCompanion,
    restartWebSocket,
  }
}
