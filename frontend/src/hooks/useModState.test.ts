import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModState } from './useModState'
import { searchMods } from '../services/api'

vi.mock('../services/api', () => ({
  getProjectMods: vi.fn().mockResolvedValue([]),
  getProjectModMetadata: vi.fn().mockResolvedValue([]),
  getDepNames: vi.fn().mockResolvedValue([]),
  checkCompatibility: vi.fn().mockResolvedValue({ compatible: true, issues: [] }),
  searchMods: vi.fn().mockResolvedValue([]),
  addMod: vi.fn().mockResolvedValue({}),
  removeMod: vi.fn().mockResolvedValue({}),
  scanInstanceMods: vi.fn().mockResolvedValue(0),
  installModFromSearch: vi.fn().mockResolvedValue({}),
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const project = {
  id: 'p1',
  name: 'Test Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'neoforge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/tmp/instance',
  source: 'modcanvas',
}

describe('useModState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('source toggle clears stale search results (29a326c)', () => {
    const { result } = renderHook(() => useModState(project))
    act(() => result.current.setSearchResults([{ name: 'stale row' }]))
    expect(result.current.searchResults).toHaveLength(1)

    // The toggle handler must clear the previous search's results, or the
    // old rows stay on screen pretending to be current (dead/bouncing look).
    act(() => result.current.setSearchSources(['curseforge']))
    expect(result.current.searchResults).toEqual([])
  })

  it('empty query without a category does not search (c619895 guard)', async () => {
    const { result } = renderHook(() => useModState(project))
    await act(async () => {
      await result.current.handleSearchMods()
    })
    expect(searchMods).not.toHaveBeenCalled()
  })

  it('empty query WITH a category searches — category browsing is not a no-op (c619895)', async () => {
    const { result } = renderHook(() => useModState(project))
    act(() => result.current.setSearchCategory('technology'))
    await act(async () => {
      await result.current.handleSearchMods()
    })
    expect(searchMods).toHaveBeenCalledWith(
      '',
      'neoforge',
      '1.21.1',
      ['modrinth', 'curseforge'],
      ['technology'],
    )
  })
})
