import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ipc', () => ({
  wsIpcSendEvent: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

import { wsIpcSendEvent } from './ipc'
import { listen } from '@tauri-apps/api/event'
import {
  setEngineRenderConnected,
  queueEngineRenders,
  queueEngineRendersPriority,
  subscribeEngineRenders,
  initEngineRenderListener,
  __resetEngineRenderState,
  normalizeItemId,
} from './engine-render'

const mockSend = vi.mocked(wsIpcSendEvent)
const mockListen = vi.mocked(listen)

describe('engine-render pipeline', () => {
  type WsEvent = { event: string; id: number; payload: Record<string, unknown> }
  const capturedListeners = new Map<string, (event: WsEvent) => void>()
  const emitWs = (payload: Record<string, unknown>) => {
    capturedListeners.get('ws-ipc:event')?.({ event: 'ws-ipc:event', id: 0, payload })
  }

  beforeEach(() => {
    __resetEngineRenderState()
    capturedListeners.clear()
    mockSend.mockReset()
    mockSend.mockResolvedValue(1 as never)
    mockListen.mockReset()
    mockListen.mockImplementation(
      (channel: string, handler: (event: WsEvent) => void) => {
        capturedListeners.set(channel, handler)
        return Promise.resolve(() => {})
      },
    )
  })

  it('does not send until connected', () => {
    queueEngineRenders(['minecraft:diamond'])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends a batched RENDER_ITEMS_REQUEST when connected', () => {
    setEngineRenderConnected(true)
    queueEngineRenders(['minecraft:diamond', 'minecraft:iron_ingot'])
    expect(mockSend).toHaveBeenCalledTimes(1)
    const [eventType, path, payload] = mockSend.mock.calls[0] as [string, unknown, Record<string, unknown>]
    expect(eventType).toBe('RENDER_ITEMS_REQUEST')
    expect(path).toBeUndefined()
    expect(payload.items).toEqual(['minecraft:diamond', 'minecraft:iron_ingot'])
    expect(payload.size).toBe(64)
    expect(typeof payload.requestId).toBe('string')
  })

  it('deduplicates queued ids and does not re-send while a batch is in flight', async () => {
    setEngineRenderConnected(true)
    queueEngineRenders(['minecraft:diamond', 'minecraft:diamond', 'minecraft:iron_ingot'])
    // Second flush attempt while the first batch is in flight must not re-send.
    queueEngineRenders(['minecraft:gold_ingot'])
    expect(mockSend).toHaveBeenCalledTimes(1)

    await initEngineRenderListener()
    const requestId = (mockSend.mock.calls[0][2] as { requestId: string }).requestId
    emitWs({ event: 'RENDER_ITEMS_RESULT', payload: { requestId, rendered: { 'minecraft:diamond': 'data:image/png;base64,AAA' } } })

    // After the batch resolves, the queued gold_ingot is flushed next.
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('emits rendered icons to subscribers', async () => {
    const seen: Record<string, string>[] = []
    subscribeEngineRenders((rendered) => seen.push(rendered))
    await initEngineRenderListener()

    const rendered = { 'minecraft:diamond': 'data:image/png;base64,AAA', 'minecraft:iron_ingot': 'data:image/png;base64,BBB' }
    emitWs({ event: 'RENDER_ITEMS_RESULT', payload: { rendered } })
    expect(seen).toEqual([rendered])
  })

  it('requeues a failed broadcast, capped by MAX_ATTEMPTS', async () => {
    setEngineRenderConnected(true)
    mockSend.mockRejectedValueOnce(new Error('down'))
    queueEngineRenders(['minecraft:diamond'])
    // Let the rejection microtasks run: they release the batch and re-flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect((mockSend.mock.calls[1][2] as { items: string[] }).items).toEqual(['minecraft:diamond'])
  })

  it('priority queue renders visible items before bulk items', async () => {
    setEngineRenderConnected(true)
    queueEngineRenders(['mod:bulk_a', 'mod:bulk_b'])
    expect((mockSend.mock.calls[0][2] as { items: string[] }).items).toEqual(['mod:bulk_a', 'mod:bulk_b'])
    const requestId = (mockSend.mock.calls[0][2] as { requestId: string }).requestId

    // While the first batch is in flight, add bulk + priority work.
    queueEngineRenders(['mod:bulk_c'])
    queueEngineRendersPriority(['view:visible'])
    await initEngineRenderListener()
    emitWs({ event: 'RENDER_ITEMS_RESULT', payload: { requestId, rendered: {} } })

    const sent = (mockSend.mock.calls[1][2] as { items: string[] }).items
    expect(sent[0]).toBe('view:visible')
    expect(sent).toContain('mod:bulk_c')
  })

  it('normalizeItemId maps bake descriptors and strips prefixes', () => {
    expect(normalizeItemId('minecraft:diamond')).toBe('minecraft:diamond')
    expect(normalizeItemId('bake:minecraft:block/crafting_table')).toBe('minecraft:crafting_table')
    expect(normalizeItemId('bake:modid:handmodel/gizmo')).toBe('modid:gizmo')
    expect(normalizeItemId('modid:item/thing')).toBe('modid:thing')
    expect(normalizeItemId('#forge:ingots/iron')).toBeNull()
    expect(normalizeItemId('mod:relics')).toBeNull()
    expect(normalizeItemId('ftbquests:textures/questpics/star')).toBeNull()
    expect(normalizeItemId('')).toBeNull()
  })
})
