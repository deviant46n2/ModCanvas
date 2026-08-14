import { describe, it, expect } from 'vitest'
import { checkCoreMods } from './mods'

describe('checkCoreMods', () => {
  it('is silent when the mods dir was never scanned (null — no claim, Trust Rule)', () => {
    expect(checkCoreMods(null)).toEqual([])
  })

  it('reports nothing when both core mods are installed', () => {
    const mods = ['ftb-quests-neoforge-2101.1.30.jar', 'kubejs-neoforge-2101.6.1.jar', 'workbench-companion-1.0.0.jar']
    expect(checkCoreMods(mods)).toEqual([])
  })

  it('blocks when FTB Quests is missing', () => {
    const items = checkCoreMods(['kubejs-neoforge-2101.6.1.jar'])
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('mods.core-missing.ftb-quests')
    expect(items[0].severity).toBe('blocking')
    expect(items[0].target).toEqual({ section: 'mods' })
  })

  it('blocks when KubeJS is missing', () => {
    const items = checkCoreMods(['ftb-quests-neoforge-2101.1.30.jar'])
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('mods.core-missing.kubejs')
  })

  it('blocks on both when neither core mod is present (an empty mods dir)', () => {
    const items = checkCoreMods([])
    expect(items.map((i) => i.id)).toEqual(['mods.core-missing.ftb-quests', 'mods.core-missing.kubejs'])
  })

  it('matches FTB Quests jar-name variants', () => {
    for (const name of ['FTB-Quests-2101.1.30.jar', 'ftbquests-neoforge.jar', 'ftb_quests.jar']) {
      expect(checkCoreMods([name, 'kubejs.jar'])).toEqual([])
    }
  })

  it('an empty mods dir is NOT silent — it is proof of absence (the dir was scanned)', () => {
    const items = checkCoreMods([])
    expect(items.length).toBeGreaterThan(0)
  })
})
