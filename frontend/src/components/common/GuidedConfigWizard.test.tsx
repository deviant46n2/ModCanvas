import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedConfigWizard, type GuidedConfigTarget } from './GuidedConfigWizard'
import type { ConfigValue, ConfigFileInfo } from '../../core/config/types'

// P0-MINIWIZ contract: the wizard finds a setting and hands the target to
// onApply — the editor's own update + save path (history + save_structured).
// It never parses or writes files itself.

const files: ConfigFileInfo[] = [
  { path: 'config/server.toml', name: 'server.toml', format: 'toml', size: 100 },
]

const root: ConfigValue = {
  type: 'object',
  fields: {
    general: {
      type: 'group',
      fields: {
        keepInventory: { type: 'boolean', value: true, comment: 'Keep inventory on death' },
        difficulty: { type: 'string', value: 'hard' },
        tps: { type: 'number', value: 20 },
      },
    },
  },
}

function renderWizard(onApply: (t: GuidedConfigTarget) => void, openRoot: ConfigValue | null = root, openFilePath: string | null = 'config/server.toml') {
  const onOpenFile = vi.fn()
  render(
    <GuidedConfigWizard
      open
      configFiles={files}
      openFilePath={openFilePath}
      openRoot={openRoot}
      onOpenFile={onOpenFile}
      onApply={onApply}
      onClose={() => {}}
    />,
  )
  return { onOpenFile }
}

describe('GuidedConfigWizard', () => {
  it('searches settings by plain words and applies an edit through onApply', () => {
    const onApply = vi.fn()
    renderWizard(onApply)

    // Step 1: pick the config file.
    fireEvent.click(screen.getByText('server.toml'))
    // Step 2: search a setting by plain words.
    const search = screen.getByPlaceholderText(/keep inventory/) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'keep inventory' } })
    fireEvent.click(screen.getByText('general › keepInventory'))
    // Step 3: toggle the boolean off.
    fireEvent.click(screen.getByText('ON'))
    fireEvent.click(screen.getByText('Apply tweak'))

    expect(onApply).toHaveBeenCalledTimes(1)
    const target = onApply.mock.calls[0][0]
    expect(target.filePath).toBe('config/server.toml')
    expect(target.path).toEqual(['general', 'keepInventory'])
    expect(target.value.value).toBe(false)
  })

  it('matches string values, not just keys', () => {
    const onApply = vi.fn()
    renderWizard(onApply)

    fireEvent.click(screen.getByText('server.toml'))
    const search = screen.getByPlaceholderText(/keep inventory/) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'hard' } })
    fireEvent.click(screen.getByText('general › difficulty'))
    fireEvent.click(screen.getByText('Apply tweak'))

    const target = onApply.mock.calls[0][0]
    expect(target.path).toEqual(['general', 'difficulty'])
    expect(target.value.value).toBe('hard')
  })

  it('reports no matches for a miss', () => {
    renderWizard(vi.fn())
    fireEvent.click(screen.getByText('server.toml'))
    const search = screen.getByPlaceholderText(/keep inventory/) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText(/No settings match/)).toBeTruthy()
  })

  it('falls back to the raw content when no parsed tree exists (file open in raw mode)', () => {
    const onApply = vi.fn()
    renderWizard(onApply, null, null)
    // No parsed root: step 1 still lets you pick the file (which opens it).
    fireEvent.click(screen.getByText('server.toml'))
    expect(screen.getByText(/Open a config file first/)).toBeTruthy()
  })
})
