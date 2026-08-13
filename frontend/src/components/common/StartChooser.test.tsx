import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartChooser, type StartIntent } from './StartChooser'

describe('StartChooser', () => {
  const onPick = vi.fn<(intent: StartIntent) => void>()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderChooser(show = true) {
    render(<StartChooser show={show} onPick={onPick} onClose={onClose} />)
  }

  it('renders nothing when closed', () => {
    renderChooser(false)
    expect(screen.queryByText('Start a Pack')).toBeNull()
  })

  it('offers all four starting points', () => {
    renderChooser()
    expect(screen.getByText('Start a Pack')).toBeTruthy()
    expect(screen.getByText(/Intro — your first pack/)).toBeTruthy()
    expect(screen.getByText(/IDE Tour — learn every tool/)).toBeTruthy()
    expect(screen.getByText('Blank project')).toBeTruthy()
    expect(screen.getByText('Load a project')).toBeTruthy()
  })

  it('intro card hands off to the wizard with the intro template preset', () => {
    renderChooser()
    fireEvent.click(screen.getByText(/Intro — your first pack/))
    expect(onPick).toHaveBeenCalledWith({ kind: 'intro', templateId: 'intro' })
  })

  it('ide-tour card hands off to the wizard with the ide-tour template preset', () => {
    renderChooser()
    fireEvent.click(screen.getByText(/IDE Tour — learn every tool/))
    expect(onPick).toHaveBeenCalledWith({ kind: 'ide-tour', templateId: 'ide-tour' })
  })

  it('blank card starts an empty pack', () => {
    renderChooser()
    fireEvent.click(screen.getByText('Blank project'))
    expect(onPick).toHaveBeenCalledWith({ kind: 'blank' })
  })

  it('load card hands off to the existing project list', () => {
    renderChooser()
    fireEvent.click(screen.getByText('Load a project'))
    expect(onPick).toHaveBeenCalledWith({ kind: 'load' })
  })

  it('cancel closes without picking', () => {
    renderChooser()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })
})
