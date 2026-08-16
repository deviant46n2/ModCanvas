import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuestToolbarActions } from './useQuestToolbarActions'
import type { QuestGraphData } from '../services/api'

// The mount-snapshot bug (s43): the toolbar fetched wsIpcGetStatus once at
// mount. When the app started before the game booted a companion, that
// snapshot stayed `connected: false` forever, so every save ran
// wsIpcRestart() — which stops the hub and clears ALL clients, dropping the
// healthy companion and guaranteeing "game not connected" on the broadcast.
// The fix gates the restart on the hub being genuinely down
// (companionState.serverUp), never on the companion flag.
vi.mock('../services/api', () => ({
  importFtbQuestsFromDir: vi.fn().mockResolvedValue(undefined),
  exportFtbQuestsToDir: vi.fn().mockResolvedValue(undefined),
  saveQuestGraph: vi.fn().mockResolvedValue(undefined),
  getQuestGraph: vi.fn().mockResolvedValue(null),
  wsIpcGetStatus: vi.fn().mockResolvedValue({ connected: false, clientCount: 0 }),
  wsIpcRestart: vi.fn().mockResolvedValue(undefined),
  listPrismInstances: vi.fn().mockResolvedValue([]),
}))

vi.mock('../components/quest/quest-helpers', () => ({
  defaultQuestNodeData: vi.fn().mockReturnValue({ node_type: 'quest', id: '', label: '' }),
}))

vi.mock('../core/theme/font-formatter', () => ({
  stripMcFormatting: (s: string) => s,
}))

vi.mock('../components/quest/pick-dir', () => ({
  pickDir: vi.fn().mockResolvedValue(null),
}))

vi.mock('../services/hotswap', () => ({
  reloadQuestsInGame: vi.fn().mockResolvedValue({ status: 'passed' }),
}))

import { wsIpcRestart } from '../services/api'
import { reloadQuestsInGame } from '../services/hotswap'
import { companionState } from '../services/companion-socket'

const graph: QuestGraphData = {
  id: 'g1',
  project_id: 'p1',
  name: 'Test',
  description: '',
  chapters: [],
  chapter_groups: [],
  reward_tables: [],
  nodes: [],
  edges: [],
  book_progression_mode: 'linear',
  book_icon: '',
  book_background_image: '',
  quest_color: '',
  default_quest_shape: '',
  grid_scale: 1,
}

function setup() {
  const { result } = renderHook(() =>
    useQuestToolbarActions({
      graph,
      setGraph: () => {},
      projectId: 'p1',
      projectPath: '/x/instance',
      textureIndex: {},
      modsDir: '/x/mods',
    }),
  )
  return result
}

describe('useQuestToolbarActions — reconnect gate (s43 mount-snapshot fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    companionState.serverUp = true
    companionState.connected = true
  })

  it('does NOT restart the hub when the hub is up and a companion is attached', async () => {
    const result = setup()

    await act(async () => {
      await result.current.saveAndHotReload()
    })

    expect(wsIpcRestart).not.toHaveBeenCalled()
    expect(reloadQuestsInGame).toHaveBeenCalledTimes(1)
  })

  it('restarts the hub only when the hub itself is unreachable (serverUp false)', async () => {
    companionState.serverUp = false
    const result = setup()

    await act(async () => {
      await result.current.saveAndHotReload()
    })

    expect(wsIpcRestart).toHaveBeenCalledTimes(1)
  })
})
