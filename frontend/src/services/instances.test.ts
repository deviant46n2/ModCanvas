import { describe, it, expect } from 'vitest'
import { wizardCandidates, type MinecraftInstance } from './instances'

const inst = (over: Partial<MinecraftInstance> = {}): MinecraftInstance => ({
  id: 'i1',
  name: 'Test Instance',
  mc_version: '1.21.1',
  loader: 'NeoForge',
  loader_version: '21.1.45',
  game_dir: '/instances/test/minecraft',
  status: 'Offline',
  ...over,
})

describe('wizardCandidates', () => {
  it('keeps usable offline instances', () => {
    expect(wizardCandidates([inst()])).toHaveLength(1)
  })

  it('excludes running instances (files in use — cannot scaffold)', () => {
    const running = inst({ id: 'i2', status: 'Running' })
    expect(wizardCandidates([inst(), running])).toHaveLength(1)
  })

  it('excludes instances whose loader or version could not be parsed', () => {
    const unknownLoader = inst({ id: 'i2', loader: 'Unknown' })
    const unknownVersion = inst({ id: 'i3', mc_version: 'Unknown' })
    expect(wizardCandidates([inst(), unknownLoader, unknownVersion])).toHaveLength(1)
  })
})
