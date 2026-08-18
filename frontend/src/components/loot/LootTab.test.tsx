import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LootTab } from './LootTab'
import { useLootTables } from '../../hooks/useLootTables'
import { useLootEditor } from '../../hooks/useLootEditor'
import { useBehaviorItemPicker } from '../../hooks/useBehaviorItemPicker'
import { copyLootTableToPack, type DiscoveredLootTable } from '../../services/loot'

// The three hooks + the service module are mocked; the adapter matrix stays
// real (pure derivation — `getLootDirName` resolves to 'loot_table' for 1.21+).
vi.mock('../../hooks/useLootTables', () => ({ useLootTables: vi.fn() }))
vi.mock('../../hooks/useLootEditor', () => ({ useLootEditor: vi.fn() }))
vi.mock('../../hooks/useBehaviorItemPicker', () => ({ useBehaviorItemPicker: vi.fn() }))
vi.mock('../../services/loot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/loot')>()
  return {
    ...actual,
    createLootTable: vi.fn(),
    copyLootTableToPack: vi.fn(),
  }
})

const vanillaTable: DiscoveredLootTable = {
  id: 'minecraft:chests/simple_dungeon',
  source: 'jar:/games/1.21.1.jar!data/minecraft/loot_table/chests/simple_dungeon.json',
  table_type: 'minecraft:chest',
  pools: 3,
  entries: 7,
  editable: false,
  vanilla: true,
}

const modTable: DiscoveredLootTable = {
  id: 'ftbquests:blocks/screen_1',
  source: 'jar:/mods/ftbquests.jar!data/ftbquests/loot_table/blocks/screen_1.json',
  table_type: 'minecraft:chest',
  pools: 1,
  entries: 1,
  editable: false,
  vanilla: false,
}

const packTable: DiscoveredLootTable = {
  id: 'minecraft:chests/my_dungeon',
  source: '/pack/data/minecraft/loot_table/chests/my_dungeon.json',
  table_type: 'minecraft:chest',
  pools: 2,
  entries: 4,
  editable: true,
  vanilla: false,
}

function setupTables(tables: DiscoveredLootTable[]) {
  const refresh = vi.fn()
  const open = vi.fn()
  const close = vi.fn()
  const save = vi.fn()
  const mutate = vi.fn()

  vi.mocked(useLootTables).mockReturnValue({
    scanning: false,
    error: '',
    tables,
    refresh,
  })
  vi.mocked(useLootEditor).mockReturnValue({
    status: { state: 'idle' },
    table: null,
    dirty: false,
    open,
    close,
    save,
    mutate,
  })
  vi.mocked(useBehaviorItemPicker).mockReturnValue({
    items: [],
    tags: [],
    getTextureUrl: () => null,
  })

  return { refresh, open, close }
}

function renderTab(tables: DiscoveredLootTable[]) {
  setupTables(tables)
  return render(
    <LootTab
      projectId="p1"
      projectPath="/pack"
      instancePath="/instance/minecraft"
      minecraftVersion="1.21.1"
      modLoader="neoforge"
    />,
  )
}

describe('LootTab (B1, s72)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the instance path to the scan hook', () => {
    renderTab([packTable])
    expect(useLootTables).toHaveBeenCalledWith('/pack', '/instance/minecraft')
  })

  it('badges vanilla tables distinctly from mod-jar tables', () => {
    renderTab([vanillaTable, modTable, packTable])
    const vanillaRow = screen.getByRole('option', { name: /minecraft:chests\/simple_dungeon/ })
    expect(vanillaRow.textContent).toContain('· vanilla')
    expect(vanillaRow.textContent).not.toContain('· jar')
    const modRow = screen.getByRole('option', { name: /ftbquests:blocks\/screen_1/ })
    expect(modRow.textContent).toContain('· jar')
    const packRow = screen.getByRole('option', { name: /minecraft:chests\/my_dungeon/ })
    expect(packRow.textContent).not.toContain('· vanilla')
    expect(packRow.textContent).not.toContain('· jar')
  })

  it('shows the correct source note for vanilla vs mod-jar tables', () => {
    renderTab([vanillaTable])
    fireEvent.click(screen.getByRole('option', { name: /minecraft:chests\/simple_dungeon/ }))
    expect(screen.getByText(/From the vanilla game jar — read-only/)).toBeInTheDocument()

    renderTab([modTable])
    fireEvent.click(screen.getByRole('option', { name: /ftbquests:blocks\/screen_1/ }))
    expect(screen.getByText(/From a mod jar — read-only/)).toBeInTheDocument()
  })

  it('copies a read-only table to the pack, refreshes, and opens the editable row', async () => {
    const copied = { ...vanillaTable, editable: true, vanilla: false }
    vi.mocked(copyLootTableToPack).mockResolvedValue(copied)
    const { refresh, open } = setupTables([vanillaTable])
    render(
      <LootTab
        projectId="p1"
        projectPath="/pack"
        instancePath="/instance/minecraft"
        minecraftVersion="1.21.1"
        modLoader="neoforge"
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /minecraft:chests\/simple_dungeon/ }))
    fireEvent.click(screen.getByRole('button', { name: /copy to pack/i }))

    await waitFor(() => {
      expect(copyLootTableToPack).toHaveBeenCalledWith(
        '/pack',
        vanillaTable.source,
        'loot_table',
      )
      expect(refresh).toHaveBeenCalled()
      expect(open).toHaveBeenCalledWith(copied)
    })
  })

  it('surfaces a copy failure instead of pretending it worked', async () => {
    vi.mocked(copyLootTableToPack).mockRejectedValue(
      'Refusing to overwrite existing loot table minecraft:chests/simple_dungeon',
    )
    setupTables([vanillaTable])
    render(
      <LootTab
        projectId="p1"
        projectPath="/pack"
        instancePath="/instance/minecraft"
        minecraftVersion="1.21.1"
        modLoader="neoforge"
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /minecraft:chests\/simple_dungeon/ }))
    fireEvent.click(screen.getByRole('button', { name: /copy to pack/i }))

    await waitFor(() => {
      expect(screen.getByText(/Refusing to overwrite/)).toBeInTheDocument()
    })
  })
})