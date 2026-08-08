#!/usr/bin/env node
// Restart-instance trigger for ModCanvas dev loops.
//
// Connects to the ModCanvas WebSocket hub as a Tool peer (client
// "modcanvas-tool"), sends RESTART_INSTANCE, and disconnects. The frontend
// orchestrator receives the frame (hub routes tool frames to the app peer)
// and runs the same stop -> wait -> relaunch flow as the status-bar Restart
// button: STOP_INSTANCE to the companion, wait for the game to exit, then
// relaunch via the normal launch path (which re-deploys the companion).
//
// Usage:  node scripts/restart-instance.mjs [host] [port]
// Defaults: 127.0.0.1:9876 (the app's hub port).
//
// Tool role is deliberate: the hub excludes tool peers from the companion
// count, so attaching this script does NOT make the connection pill flash
// "Instance Connected" while it is connected.
// (Node >= 22 provides the global WebSocket client; no dependency needed.)

const HOST = process.argv[2] ?? '127.0.0.1'
const PORT = Number(process.argv[3] ?? 9876)

const url = `ws://${HOST}:${PORT}`
const ws = new WebSocket(url)

const fail = (msg) => {
  console.error(`restart-instance: ${msg}`)
  process.exit(1)
}

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ event: 'CLIENT_INFO', timestamp: Math.floor(Date.now() / 1000), payload: { client: 'modcanvas-tool', version: '0.1.0' } }))
  ws.send(JSON.stringify({ event: 'RESTART_INSTANCE', timestamp: Math.floor(Date.now() / 1000) }))
})

ws.addEventListener('message', (msg) => {
  // The hub sends CONNECTION_STATUS frames to the app peer, but a tool peer
  // gets no replay — any frame here means the hub is alive; we don't need it.
  void msg
})

ws.addEventListener('error', () => fail(`cannot reach the hub at ${url} (is the app running?)`))
ws.addEventListener('close', () => {
  console.log(`restart-instance: RESTART_INSTANCE sent to ${url}; the app will restart the game.`)
  process.exit(0)
})

setTimeout(() => fail(`timed out talking to ${url}`), 5000)
