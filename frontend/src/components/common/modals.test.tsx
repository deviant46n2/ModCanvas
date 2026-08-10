import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewProjectModal } from './modals'
import { servedMatrix } from '../../adapters/served-matrix'

const LOADER_LABELS: Record<string, string> = {
  neoforge: 'NeoForge',
  forge: 'Forge',
  fabric: 'Fabric',
  quilt: 'Quilt',
}

function makeBase() {
  return {
    show: true,
    onClose: vi.fn(),
    projectName: '',
    onProjectNameChange: vi.fn(),
    mcVersion: '1.21.1',
    onMcVersionChange: vi.fn(),
    modLoader: 'Forge',
    onModLoaderChange: vi.fn(),
    onCreate: vi.fn(),
  }
}

function getSelects(): { version: HTMLSelectElement; loader: HTMLSelectElement } {
  const selects = screen.getAllByRole('combobox')
  return { version: selects[0] as HTMLSelectElement, loader: selects[1] as HTMLSelectElement }
}

function optionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value)
}

describe('NewProjectModal', () => {
  it('offers exactly the versions the adapter matrix can serve', () => {
    const base = makeBase()
    render(<NewProjectModal {...base} />)
    const { version } = getSelects()
    const served = servedMatrix().map((v) => v.mcVersion)
    expect(optionValues(version)).toEqual(served)
    // The s34 regression: 1.19.2 was offered with no adapter behind it.
    expect(optionValues(version)).not.toContain('1.19.2')
  })

  it('offers exactly the loaders served for the selected version', () => {
    const base = makeBase()
    render(<NewProjectModal {...base} />)
    const { loader } = getSelects()
    const servedLoaders =
      servedMatrix().find((v) => v.mcVersion === '1.21.1')?.loaders ?? []
    expect(optionValues(loader)).toEqual(
      servedLoaders.map((l) => LOADER_LABELS[l]),
    )
  })

  it('resets the loader when the new version does not serve it', () => {
    const base = makeBase()
    // Quilt exists only for 1.21.1; switching to 1.20.1 must reset to a
    // loader 1.20.1 actually serves (its first: Forge).
    render(<NewProjectModal {...base} modLoader="Quilt" />)
    const { version } = getSelects()
    fireEvent.change(version, { target: { value: '1.20.1' } })
    expect(base.onMcVersionChange).toHaveBeenCalledWith('1.20.1')
    expect(base.onModLoaderChange).toHaveBeenCalledWith('Forge')
  })

  it('keeps the loader when the new version still serves it', () => {
    const base = makeBase()
    render(<NewProjectModal {...base} modLoader="Forge" />)
    const { version } = getSelects()
    fireEvent.change(version, { target: { value: '1.20.1' } })
    expect(base.onModLoaderChange).not.toHaveBeenCalled()
  })
})
