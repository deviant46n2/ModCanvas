// Companion bridge peer.
//
// The frontend joins the ModCanvas WebSocket hub (127.0.0.1:9876) directly
// instead of relying on Tauri's event channel, which silently drops
// Rust -> webview events on some Linux/WebKitGTK stacks (evals from async
// commands never run). The server classifies this socket by its CLIENT_INFO
// frame and routes companion frames + CONNECTION_STATUS pushes to it.
import type { ModEvent } from './types'

type StatusPayload = { connected: boolean; clientCount: number; port: number }
type StatusSubscriber = (status: StatusPayload) => void
type EventSubscriber = (frame: ModEvent) => void

const EVENT_STATUS = 'CONNECTION_STATUS'
const CLIENT_INFO = 'CLIENT_INFO'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelayMs = 2000
let stopped = false

const statusSubs = new Set<StatusSubscriber>()
const eventSubs = new Set<EventSubscriber>()

/** Latest bridge state (companion presence), for synchronous reads. */
export const companionState = { connected: false, serverUp: false }

function sendFrame(frame: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(frame))
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelayMs)
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000)
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  try {
    const ws = new WebSocket('ws://127.0.0.1:9876')
    socket = ws
    ws.onopen = () => {
      companionState.serverUp = true
      reconnectDelayMs = 2000
      sendFrame({
        event: CLIENT_INFO,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { client: 'modcanvas-app', version: '0.1.0' },
      })
    }
    ws.onmessage = (msg) => {
      let frame: ModEvent
      try {
        frame = JSON.parse(String(msg.data)) as ModEvent
      } catch {
        return // malformed frame — ignore
      }
      if (frame.event === EVENT_STATUS) {
        const status = (frame.payload ?? {}) as StatusPayload
        companionState.connected = !!status.connected
        for (const cb of [...statusSubs]) cb(status)
      } else {
        for (const cb of [...eventSubs]) cb(frame)
      }
    }
    ws.onclose = () => {
      companionState.serverUp = false
      companionState.connected = false
      if (socket === ws) socket = null
      if (!stopped) scheduleReconnect()
    }
    ws.onerror = () => {
      // onclose follows; nothing to do here
    }
  } catch {
    if (!stopped) scheduleReconnect()
  }
}

/** Start the peer socket. Idempotent; reconnects with backoff until stopped. */
export function startCompanionSocket() {
  stopped = false
  connect()
}

/** Stop the peer socket (app teardown). */
export function stopCompanionSocket() {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
}

/** Subscribe to CONNECTION_STATUS pushes. Returns an unsubscribe fn. */
export function onCompanionStatus(cb: StatusSubscriber): () => void {
  statusSubs.add(cb)
  return () => statusSubs.delete(cb)
}

/** Subscribe to companion frames (CLIENT_INFO, ASSETS_READY, results, ...). */
export function onCompanionEvent(cb: EventSubscriber): () => void {
  eventSubs.add(cb)
  return () => eventSubs.delete(cb)
}

/** Ask the companion to dump its authoritative item registry
 *  (BuiltInRegistries.ITEM). Sent when the bridge connects (s59): the game
 *  registry replaces the lang-key-scanned list, which lies (effect-variant
 *  floods, banner pattern keys). */
export function requestItemRegistry(): void {
  sendFrame({
    event: 'ITEM_REGISTRY_REQUEST',
    timestamp: Math.floor(Date.now() / 1000),
  })
}
