import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceStatusBar } from './statusbar'

const wsConnected = { connected: true, clientCount: 1, port: 9876 }
const wsOffline = { connected: false, clientCount: 0, port: 9876 }

const base = {
  wsStatus: wsOffline,
  onRestartWebSocket: vi.fn(),
  isTesting: false,
  testProgress: '',
  testError: '',
  deployCompanionMessage: '',
}

describe('WorkspaceStatusBar', () => {
  it('renders the offline WebSocket state', () => {
    render(<WorkspaceStatusBar {...base} />)
    expect(screen.getByText('Offline / Idle')).toBeInTheDocument()
  })

  it('renders the connected state', () => {
    render(<WorkspaceStatusBar {...base} wsStatus={wsConnected} />)
    expect(screen.getByText('Minecraft Connected')).toBeInTheDocument()
  })

  it('shows a restart action for the WebSocket server', () => {
    render(<WorkspaceStatusBar {...base} />)
    expect(screen.getByRole('button', { name: /restart websocket server/i })).toBeInTheDocument()
  })

  it('shows progress while testing', () => {
    render(<WorkspaceStatusBar {...base} isTesting={true} testProgress="Launching instance..." />)
    expect(screen.getByText(/launching instance/i)).toBeInTheDocument()
  })

  it('shows a success message after a completed test', () => {
    render(<WorkspaceStatusBar {...base} testProgress="Test instance launched!" />)
    const msg = screen.getByText('Test instance launched!')
    expect(msg.className).toContain('ok')
  })

  it('renders test errors with a copy button and the full text in the title', () => {
    render(<WorkspaceStatusBar {...base} testError={'line one\nline two\nrest of trace'} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Test failed: line one')
    expect(alert).toHaveAttribute('title', 'line one\nline two\nrest of trace')
    expect(screen.getByRole('button', { name: /copy error text/i })).toBeInTheDocument()
  })

  it('classifies deploy messages by their glyph', () => {
    const { unmount } = render(
      <WorkspaceStatusBar {...base} deployCompanionMessage={'\u2713 Companion mod deployed'} />
    )
    expect(screen.getByText('Companion mod deployed').className).toContain('ok')
    unmount()
    render(<WorkspaceStatusBar {...base} deployCompanionMessage={'\u2717 boom'} />)
    expect(screen.getByText('boom').className).toContain('error')
  })

  it('renders neutral deploy progress as info', () => {
    render(<WorkspaceStatusBar {...base} deployCompanionMessage={'Deploying...'} />)
    expect(screen.getByText('Deploying...').className).toContain('info')
  })
})
