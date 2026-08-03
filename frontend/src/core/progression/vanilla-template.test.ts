import { describe, it, expect } from 'vitest'
import { buildVanillaTemplate, VANILLA_TEMPLATE_ID, vanillaTemplateItemRefs, VANILLA_PHASES } from './vanilla-template'

describe('vanilla-template', () => {
  it('builds a detailed graph across all five advancement tabs', () => {
    const graph = buildVanillaTemplate('proj-1')
    expect(graph.id).toBe(VANILLA_TEMPLATE_ID)
    expect(graph.project_id).toBe('proj-1')
    expect(graph.name).toBe('Vanilla Progression')
    expect(graph.nodes.length).toBeGreaterThanOrEqual(45)
    expect(graph.edges.length).toBeGreaterThanOrEqual(45)
    expect(VANILLA_PHASES).toEqual(['The Story', 'The Nether', 'The End', 'Adventure', 'Husbandry'])
    expect(graph.chapters.length).toBe(VANILLA_PHASES.length)
  })

  it('every phase has a meaningful number of nodes', () => {
    const graph = buildVanillaTemplate('proj-1')
    const byPhase: Record<string, number> = {}
    for (const node of graph.nodes) {
      byPhase[node.phase] = (byPhase[node.phase] ?? 0) + 1
    }
    expect(byPhase['The Story']).toBeGreaterThanOrEqual(15)
    expect(byPhase['The Nether']).toBeGreaterThanOrEqual(10)
    expect(byPhase['The End']).toBeGreaterThanOrEqual(8)
    expect(byPhase['Adventure']).toBeGreaterThanOrEqual(8)
    expect(byPhase['Husbandry']).toBeGreaterThanOrEqual(8)
  })

  it('every node has a phase, icon, and item refs', () => {
    const graph = buildVanillaTemplate('proj-1')
    for (const node of graph.nodes) {
      expect(node.phase, node.label).toBeTruthy()
      expect(node.icon, node.label).toBeTruthy()
      expect(node.item_refs.length, node.label).toBeGreaterThan(0)
    }
  })

  it('every edge references real node ids (no dangling edges)', () => {
    const graph = buildVanillaTemplate('proj-1')
    const ids = new Set(graph.nodes.map((n) => n.id))
    for (const edge of graph.edges) {
      expect(ids.has(edge.source), `edge source ${edge.source}`).toBe(true)
      expect(ids.has(edge.target), `edge target ${edge.target}`).toBe(true)
    }
  })

  it('each phase lays out in a distinct column', () => {
    const graph = buildVanillaTemplate('proj-1')
    const xByPhase = new Map<string, number>()
    for (const n of graph.nodes) {
      xByPhase.set(n.phase, n.position.x)
    }
    const distinctX = new Set(xByPhase.values())
    expect(distinctX.size).toBe(VANILLA_PHASES.length)
  })

  it('the Nether and End are reachable only after their prerequisites', () => {
    const graph = buildVanillaTemplate('proj-1')
    // The portal must exist and lead to the Nether root.
    expect(graph.edges.some((e) => e.source === 's_portal' && e.target === 'n_root')).toBe(true)
    // The End is reached through the End portal.
    expect(graph.edges.some((e) => e.source === 's_end_portal' && e.target === 'e_root')).toBe(true)
  })

  it('item refs are namespaced and unique', () => {
    const refs = vanillaTemplateItemRefs()
    expect(refs.length).toBe(new Set(refs).size)
    for (const r of refs) expect(r).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/)
  })
})
