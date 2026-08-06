import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SourceToggles } from './SourceToggles'

describe('SourceToggles', () => {
  it('renders both toggles with the active state from props', () => {
    render(<SourceToggles sources={['modrinth']} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Search Modrinth' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Search CurseForge' })).not.toBeChecked()
  })

  it('removes a source when an active toggle is clicked', () => {
    const onChange = vi.fn()
    render(<SourceToggles sources={['modrinth', 'curseforge']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Search CurseForge' }))
    expect(onChange).toHaveBeenCalledWith(['modrinth'])
  })

  it('adds a source when an inactive toggle is clicked', () => {
    const onChange = vi.fn()
    render(<SourceToggles sources={['curseforge']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Search Modrinth' }))
    expect(onChange).toHaveBeenCalledWith(['curseforge', 'modrinth'])
  })

  it('allows zero selected — the caller decides what that means', () => {
    const onChange = vi.fn()
    render(<SourceToggles sources={['modrinth']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Search Modrinth' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
