import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceStatusBar } from './statusbar'
import type { ConnectionStateView } from '../../services/connection-status'

const connectedView: ConnectionStateView = {
  state: 'connected',
  label: 'Instance Connected',
  detail: 'The companion mod is connected to the bridge.',
  className: 'connected',
  dotClass: 'running',
}

const offlineView: ConnectionStateView = {
  state: 'offline',
  label: 'Instance Offline',
  detail: 'No instance launched from ModCanvas. Launch the instance here to connect the companion.',
  className: 'disconnected',
  dotClass: 'stopped',
}

const base = {
  connection: offlineView,
  onRestartWebSocket: vi.fn(),
  onRestartInstance: vi.fn(),
  isRestarting: false,
  isTesting: false,
  testProgress: '',
  testError: '',
  deployCompanionMessage: '',
}

describe('WorkspaceStatusBar', () => {
  it('renders the offline connection state with guidance in the tooltip', () => {
    render(<WorkspaceStatusBar {...base} />)
    const pill = screen.getByText('Instance Offline')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('.ws-status')).toHaveAttribute('title', offlineView.detail)
  })

  it('renders the connected state', () => {
    render(<WorkspaceStatusBar {...base} connection={connectedView} />)
    expect(screen.getByText('Instance Connected')).toBeInTheDocument()
  })

  it('renders the attention state for running-but-missing', () => {
    render(
      <WorkspaceStatusBar
        {...base}
        connection={{
          ...connectedView,
          state: 'running-no-companion',
          label: 'Instance running, companion missing',
          className: 'attention',
          dotClass: 'attention',
        }}
      />
    )
    const pill = screen.getByText('Instance running, companion missing')
    expect(pill.closest('.ws-status')!.className).toContain('attention')
  })

  it('shows a restart action for the WebSocket server', () => {
    render(<WorkspaceStatusBar {...base} />)
    expect(screen.getByRole('button', { name: /restart websocket server/i })).toBeInTheDocument()
  })

  it('shows a distinct restart action for the game instance and fires it', () => {
    const onRestartInstance = vi.fn()
    render(<WorkspaceStatusBar {...base} onRestartInstance={onRestartInstance} />)
    const btn = screen.getByRole('button', { name: /restart game instance/i })
    expect(btn).toBeInTheDocument()
    btn.click()
    expect(onRestartInstance).toHaveBeenCalledTimes(1)
  })

  it('disables the game restart button while testing or restarting', () => {
    const { rerender } = render(<WorkspaceStatusBar {...base} isTesting={true} />)
    expect(screen.getByRole('button', { name: /restart game instance/i })).toBeDisabled()
    rerender(<WorkspaceStatusBar {...base} isRestarting={true} />)
    expect(screen.getByRole('button', { name: /restart game instance/i })).toBeDisabled()
  })

  it('shows restart progress while restarting', () => {
    render(<WorkspaceStatusBar {...base} isRestarting={true} testProgress="Stopping game..." />)
    expect(screen.getByText(/restarting.*stopping game/i)).toBeInTheDocument()
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
