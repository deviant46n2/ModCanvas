import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ipc', () => ({
  wsIpcSendEvent: vi.fn(),
}))
vi.mock('./companion-socket', () => ({
  onCompanionEvent: vi.fn(),
}))

import { wsIpcSendEvent } from './ipc'
import { onCompanionEvent } from './companion-socket'
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
const mockOnEvent = vi.mocked(onCompanionEvent)

describe('engine-render pipeline', () => {
  type WsFrame = { event: string; payload?: Record<string, unknown> }
  let capturedHandler: ((frame: WsFrame) => void) | undefined
  const emitWs = (frame: WsFrame) => {
    capturedHandler?.(frame)
  }

  beforeEach(() => {
    __resetEngineRenderState()
    capturedHandler = undefined
    mockSend.mockReset()
    mockSend.mockResolvedValue(1 as never)
    mockOnEvent.mockReset()
    mockOnEvent.mockImplementation((handler) => {
      capturedHandler = handler as (frame: WsFrame) => void
      return () => {}
    })
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

  it('never resurrects ids whose attempts were exhausted by timeout', async () => {
    vi.useFakeTimers()
    try {
      setEngineRenderConnected(true)
      queueEngineRenders(['minecraft:diamond'])
      // Batch 1 is in flight; the companion never answers.
      expect(mockSend).toHaveBeenCalledTimes(1)

      // Timeout 1: released + requeued (retry 1 of 2) -> sent again.
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mockSend).toHaveBeenCalledTimes(2)

      // Timeout 2: requeued again (retry 2) -> sent a third time.
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mockSend).toHaveBeenCalledTimes(3)

      // Timeout 3: retries spent -> marked failed and dropped, no re-send.
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mockSend).toHaveBeenCalledTimes(3)

      // The hook effects re-offer missing ids on every state change; a failed
      // id must not be resurrected (that was the perpetual 30s stall loop).
      queueEngineRenders(['minecraft:diamond'])
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mockSend).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('exhausts ids the companion answers-but-never-renders (partial results)', async () => {
    setEngineRenderConnected(true)
    queueEngineRenders(['ok:item', 'bad:item'])
    await initEngineRenderListener()
    const currentReqId = () =>
      (mockSend.mock.calls.at(-1)?.[2] as { requestId: string }).requestId
    // The companion renders only the renderable id; the other is skipped.
    const respondPartial = () =>
      emitWs({
        event: 'RENDER_ITEMS_RESULT',
        payload: { requestId: currentReqId(), rendered: { 'ok:item': 'data:image/png;base64,AAA' } },
      })

    // Round 1: bad:item was sent but not rendered -> attempt 1; the hook
    // effects re-offer it -> sent again.
    respondPartial()
    queueEngineRenders(['bad:item'])
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Round 2: attempt 2 -> re-offered -> sent a third time.
    respondPartial()
    queueEngineRenders(['bad:item'])
    expect(mockSend).toHaveBeenCalledTimes(3)

    // Round 3: attempts spent -> failed. Re-offers are ignored for good.
    respondPartial()
    queueEngineRenders(['bad:item'])
    expect(mockSend).toHaveBeenCalledTimes(3)
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
