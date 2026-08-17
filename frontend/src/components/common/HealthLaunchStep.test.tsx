import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { HealthLaunchStep } from './HealthLaunchStep'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { useRecipeStore } from '../../core/recipe/recipe-store'

vi.mock('../../services/project', () => ({
  testProject: vi.fn(),
}))

const project = {
  id: 'p1',
  name: 'Test Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'NeoForge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/tmp/instance',
  source: 'modcanvas',
}

beforeEach(() => {
  usePackHealthStore.setState({ questGraph: null, itemRegistry: null, hasCoverImage: true })
  useRecipeStore.setState({ recipes: [] })
  // The step fetches the Pack Index on mount (P1-HEALTH-2 availability).
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_pack_index') {
      return Promise.resolve({ items: [], tags: [], references: [], dead_references: [], recipe_ids: [], recipe_outputs: [], quest_ids: [] })
    }
    return Promise.resolve(undefined)
  })
})

describe('HealthLaunchStep', () => {
  it('hides Launch and explains when the pack is not instance-backed', () => {
    render(<HealthLaunchStep project={project} packLoaded launchable={false} installedMods={null} onDone={() => {}} />)
    expect(screen.queryByRole('button', { name: /launch the pack/i })).toBeNull()
    expect(screen.getByText(/without a Prism instance/)).toBeInTheDocument()
    // The green check still shows — the pack itself can be healthy.
    expect(screen.getByText('Ready to test')).toBeInTheDocument()
  })

  it('offers Launch when the pack is instance-backed', () => {
    render(<HealthLaunchStep project={project} packLoaded launchable installedMods={null} onDone={() => {}} />)
    expect(screen.getByRole('button', { name: /launch the pack/i })).toBeInTheDocument()
  })
})
