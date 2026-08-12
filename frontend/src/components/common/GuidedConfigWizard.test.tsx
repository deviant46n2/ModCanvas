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

  it('survives being opened and closed on a live component (hooks regression)', () => {
    // The wizard is always mounted; toggling `open` must not change the hook
    // count. Regression for the s42 crash: a useState declared after the
    // `if (!open) return null` threw "Rendered more hooks than during the
    // previous render" on every open/close — the ErrorBoundary turned that
    // into a full-panel "Something went wrong".
    const { rerender } = render(
      <GuidedConfigWizard
        open={false}
        configFiles={files}
        openFilePath={null}
        openRoot={null}
        onOpenFile={vi.fn()}
        onApply={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText('server.toml')).toBeNull()
    expect(() =>
      rerender(
        <GuidedConfigWizard
          open
          configFiles={files}
          openFilePath={'config/server.toml'}
          openRoot={root}
          onOpenFile={vi.fn()}
          onApply={vi.fn()}
          onClose={() => {}}
        />,
      ),
    ).not.toThrow()
    expect(screen.getByText('server.toml')).toBeTruthy()
    // And closing again must not throw either.
    expect(() =>
      rerender(
        <GuidedConfigWizard
          open={false}
          configFiles={files}
          openFilePath={null}
          openRoot={null}
          onOpenFile={vi.fn()}
          onApply={vi.fn()}
          onClose={() => {}}
        />,
      ),
    ).not.toThrow()
  })

  it('explains raw-only packs instead of dead-ending (the Monster pack case: quest .snbt + kubejs .js + .zs)', () => {
    const rawOnlyFiles: ConfigFileInfo[] = [
      { path: 'config/ftbquests/quests/data.snbt', name: 'data.snbt', format: 'Unknown', size: 10 },
      // Recipe scripts live at the project root (kubejs/server_scripts/,
      // scripts/) — the s45 path fix stopped them landing in config/ and
      // masquerading as config files. The config browser must not list them.
      { path: 'kubejs/server_scripts/modcanvas_recipes.js', name: 'modcanvas_recipes.js', format: 'Unknown', size: 10 },
      { path: 'scripts/modcanvas_crafttweaker.zs', name: 'modcanvas_crafttweaker.zs', format: 'Unknown', size: 10 },
    ]
    render(
      <GuidedConfigWizard
        open
        configFiles={rawOnlyFiles}
        openFilePath={null}
        openRoot={null}
        onOpenFile={vi.fn()}
        onApply={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/No config files here have searchable settings/)).toBeTruthy()
    // The raw-only files are named in the explanation, never offered as
    // searchable buttons that dead-end with "No settings match".
    expect(screen.getByText(/data\.snbt/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /data\.snbt/ })).toBeNull()
    // A fresh pack gets the one fact that explains the emptiness: mods write
    // their configs on first launch (the s42 lesson, in the wizard itself).
    expect(screen.getByText(/launch it once and join a world/)).toBeTruthy()
  })

  it('lists only searchable files as pickable and counts the raw-only remainder', () => {
    const mixed: ConfigFileInfo[] = [
      { path: 'config/server.toml', name: 'server.toml', format: 'TOML', size: 100 },
      { path: 'config/ftbquests/quests/data.snbt', name: 'data.snbt', format: 'Unknown', size: 10 },
      { path: 'config/scripts/modcanvas_crafttweaker.zs', name: 'modcanvas_crafttweaker.zs', format: 'Unknown', size: 10 },
    ]
    render(
      <GuidedConfigWizard
        open
        configFiles={mixed}
        openFilePath={null}
        openRoot={null}
        onOpenFile={vi.fn()}
        onApply={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /server\.toml/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /data\.snbt/ })).toBeNull()
    expect(screen.getByText(/2 other files/)).toBeTruthy()
  })

  it('tells the user why an open file has no searchable settings instead of a dead "No settings match"', () => {
    const onOpenFile = vi.fn()
    render(
      <GuidedConfigWizard
        open
        configFiles={files}
        openFilePath={'config/server.toml'}
        openRoot={null}
        onOpenFile={onOpenFile}
        onApply={vi.fn()}
        onClose={() => {}}
      />,
    )
    // Step 1: pick the file (it advances to step 2).
    fireEvent.click(screen.getByRole('button', { name: /server\.toml/ }))
    // Step 2 with an open file that failed to parse (raw mode): no search box,
    // a direct explanation instead.
    expect(screen.getByText(/has no searchable settings/)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/keep inventory/)).toBeNull()
  })
})
