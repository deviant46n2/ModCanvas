import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchResultRow } from './rows'

const baseMod = {
  mod_id: 'sodium',
  slug: 'sodium',
  name: 'Sodium',
  description: 'Fast rendering',
  author: 'CaffeineMC',
  categories: ['performance'],
  dependencies: [],
  supported_loaders: ['neoforge'],
  supported_versions: ['1.21.1'],
  downloads: 1000,
  source_url: null,
  issues_url: null,
  documentation_url: null,
  icon: null,
  source: 'modrinth' as const,
}

const rowProps = {
  index: 0,
  style: {},
  ariaAttributes: { 'aria-posinset': 1, 'aria-setsize': 1, role: 'listitem' as const },
  searchResults: [] as Array<Record<string, unknown>>,
  projectMods: [],
  addModToProject: vi.fn(),
  installingIds: new Set<string>(),
}

describe('SearchResultRow', () => {
  it('renders an enabled Add button for a compatible mod', () => {
    render(<SearchResultRow {...rowProps} searchResults={[baseMod]} />)
    const add = screen.getByRole('button', { name: /^Add Sodium$/i })
    expect(add).not.toBeDisabled()
  })

  it('renders an Unavailable button for a version-mismatched mod (1707af8)', () => {
    const mismatch = 'Version: requires 1.20.1, 1.20.2'
    const props = { ...rowProps, searchResults: [{ ...baseMod, mismatch }] }
    render(<SearchResultRow {...props} />)
    // The dead-end row: visible, disabled, and explaining WHY — never a
    // clickable row that silently does nothing (the 1707af8 regression).
    const add = screen.getByRole('button', { name: /unavailable/i })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('title', mismatch)
    expect(screen.getByText('diff version')).toBeInTheDocument()
    fireEvent.click(add)
    expect(rowProps.addModToProject).not.toHaveBeenCalled()
  })
})
