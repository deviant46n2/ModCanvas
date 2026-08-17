import { describe, it, expect } from 'vitest'
import { checkQuestAvailability } from './availability'
import { makeGraph, makeNode, makeObjective } from '../../test-fixtures'

const recipeOutputs = new Set(['minecraft:iron_ingot', 'minecraft:oak_planks'])

function graphWith(objectives: ReturnType<typeof makeObjective>[]) {
  return makeGraph({ nodes: [makeNode({ id: 'q1', label: 'Quest One', objectives })] })
}

describe('checkQuestAvailability', () => {
  it('flags an item_crafting objective whose item has no recipe', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:diamond_sword' }),
    ])
    const findings = checkQuestAvailability(graph, recipeOutputs)
    expect(findings).toHaveLength(1)
    expect(findings[0].id).toBe('quest.no-recipe.q1.minecraft:diamond_sword')
    expect(findings[0].severity).toBe('recommended')
  })

  it('does not flag an item_crafting objective whose item is craftable', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:iron_ingot' }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(0)
  })

  it('flags acquisition marked only_from_crafting with no recipe', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_acquisition', target: 'minecraft:diamond', only_from_crafting: true }),
    ])
    const findings = checkQuestAvailability(graph, recipeOutputs)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('minecraft:diamond')
  })

  it('does NOT flag a plain acquisition with no recipe (sharp scope)', () => {
    // Oak logs have no recipe — but you MINE them. Not a finding.
    const graph = graphWith([
      makeObjective({ objective_type: 'item_acquisition', target: 'minecraft:oak_log', only_from_crafting: false }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(0)
  })

  it('does not flag acquisition marked only_from_crafting when the item IS craftable', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_retrieval', target: 'minecraft:oak_planks', only_from_crafting: true }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(0)
  })

  it('flags only_from_crafting on item_crafting and acquisition, not on block_break', () => {
    // block_break with only_from_crafting is a contradiction (you break, not
    // craft) — but the flag is not meaningful there, so it is not checked.
    const graph = graphWith([
      makeObjective({ objective_type: 'block_break', target: 'minecraft:stone', only_from_crafting: true }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(0)
  })

  it('dedupes the same item across two objectives of one quest', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:diamond_sword' }),
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:diamond_sword', label: 'O2' }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(1)
  })

  it('flags each distinct missing item once', () => {
    const graph = graphWith([
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:diamond_sword' }),
      makeObjective({ objective_type: 'item_crafting', target: 'minecraft:diamond_pickaxe' }),
    ])
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(2)
  })

  it('ignores rewards and required_items (no crafting assertion)', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q2',
          label: 'Rewards Only',
          objectives: [],
          rewards: [],
          // A required_items entry with no recipe is NOT flagged: the
          // node-level list carries no only_from_crafting assertion.
          required_items: ['minecraft:diamond_sword'],
        }),
      ],
    })
    expect(checkQuestAvailability(graph, recipeOutputs)).toHaveLength(0)
  })

  it('returns nothing for an empty graph', () => {
    expect(checkQuestAvailability(makeGraph({}), recipeOutputs)).toHaveLength(0)
  })
})
