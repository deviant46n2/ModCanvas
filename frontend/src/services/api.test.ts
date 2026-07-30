import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { wsIpcSendEvent, wsIpcGetStatus, wsIpcRestart } from '../services/api'
import { invoke } from '@tauri-apps/api/core'

const mockInvoke = vi.mocked(invoke)

describe('WebSocket IPC API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('wsIpcSendEvent', () => {
    it('should send a basic event', async () => {
      mockInvoke.mockResolvedValue(1)
      
      const result = await wsIpcSendEvent('RELOAD_QUESTS')
      
      expect(mockInvoke).toHaveBeenCalledWith('ws_ipc_send_event', {
        eventType: 'RELOAD_QUESTS',
        path: undefined,
        payload: undefined,
      })
      expect(result).toBe(1)
    })

    it('should send an event with path', async () => {
      mockInvoke.mockResolvedValue(2)
      
      const result = await wsIpcSendEvent('RELOAD_QUESTS', 'config/ftbquests/quests/chapter1.snbt')
      
      expect(mockInvoke).toHaveBeenCalledWith('ws_ipc_send_event', {
        eventType: 'RELOAD_QUESTS',
        path: 'config/ftbquests/quests/chapter1.snbt',
        payload: undefined,
      })
      expect(result).toBe(2)
    })

    it('should send an event with payload', async () => {
      mockInvoke.mockResolvedValue(1)
      const payload = { reason: 'file_changed', timestamp: Date.now() }
      
      const result = await wsIpcSendEvent('RELOAD_QUESTS', 'config/ftbquests/quests/chapter1.snbt', payload)
      
      expect(mockInvoke).toHaveBeenCalledWith('ws_ipc_send_event', {
        eventType: 'RELOAD_QUESTS',
        path: 'config/ftbquests/quests/chapter1.snbt',
        payload,
      })
      expect(result).toBe(1)
    })

    it('should handle errors from invoke', async () => {
      mockInvoke.mockRejectedValue(new Error('WebSocket server not running'))
      
      await expect(wsIpcSendEvent('RELOAD_QUESTS')).rejects.toThrow('WebSocket server not running')
    })
  })

  describe('wsIpcGetStatus', () => {
    it('should return connection status', async () => {
      const mockStatus = { connected: true, client_count: 1, port: 9876 }
      mockInvoke.mockResolvedValue(mockStatus)
      
      const result = await wsIpcGetStatus()
      
      expect(mockInvoke).toHaveBeenCalledWith('ws_ipc_get_status')
      expect(result).toEqual(mockStatus)
    })

    it('should return disconnected status when no clients', async () => {
      const mockStatus = { connected: false, client_count: 0, port: 9876 }
      mockInvoke.mockResolvedValue(mockStatus)
      
      const result = await wsIpcGetStatus()
      
      expect(result).toEqual(mockStatus)
    })
  })

  describe('wsIpcRestart', () => {
    it('should restart the WebSocket server', async () => {
      mockInvoke.mockResolvedValue(undefined)
      
      await wsIpcRestart()
      
      expect(mockInvoke).toHaveBeenCalledWith('ws_ipc_restart')
    })

    it('should handle restart errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Port already in use'))
      
      await expect(wsIpcRestart()).rejects.toThrow('Port already in use')
    })
  })
})