import { invoke } from '@tauri-apps/api/core'
import type { WsConnectionStatus } from './types'

export async function wsIpcSendEvent(
  eventType: string,
  path?: string,
  payload?: any,
): Promise<number> {
  return invoke<number>('ws_ipc_send_event', { eventType, path, payload })
}

export async function wsIpcGetStatus(): Promise<WsConnectionStatus> {
  return invoke<WsConnectionStatus>('ws_ipc_get_status')
}

export async function wsIpcRestart(): Promise<void> {
  return invoke('ws_ipc_restart')
}
