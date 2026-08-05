import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeavePackModal } from './LeavePackModal'

const base = {
  show: true,
  onSave: vi.fn(),
  onDiscard: vi.fn(),
  onCancel: vi.fn(),
}

describe('LeavePackModal', () => {
  it('renders nothing when hidden', () => {
    const { container } = render(<LeavePackModal {...base} show={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the Save / Discard / Cancel actions when shown', () => {
    render(<LeavePackModal {...base} />)
    expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save & leave/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('fires Save', () => {
    render(<LeavePackModal {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /save & leave/i }))
    expect(base.onSave).toHaveBeenCalledTimes(1)
  })

  it('fires Discard', () => {
    render(<LeavePackModal {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(base.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('fires Cancel from the button and from clicking the overlay', () => {
    const onCancel = vi.fn()
    render(<LeavePackModal {...base} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('.modal-overlay')!)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('does not close when clicking inside the modal body', () => {
    const onCancel = vi.fn()
    render(<LeavePackModal {...base} onCancel={onCancel} />)
    fireEvent.click(document.querySelector('.modal')!)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
