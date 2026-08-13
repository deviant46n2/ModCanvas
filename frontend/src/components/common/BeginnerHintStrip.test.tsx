import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BeginnerHintStrip } from './BeginnerHintStrip'
import type { PackHealthReport } from '../../core/pack-health/types'
import type { QuestGraphData } from '../../services/quest-types'
import type { ConnectionSignals } from '../../services/connection-status'

let mockReport: PackHealthReport | null
let mockGraph: QuestGraphData | null

vi.mock('./PackHealthProvider', () => ({
  usePackHealth: () => ({ report: mockReport }),
}))

vi.mock('../../core/pack-health/pack-health-store', () => ({
  usePackHealthStore: (sel: (s: { questGraph: QuestGraphData | null }) => unknown) =>
    sel({ questGraph: mockGraph }),
}))

const offline: ConnectionSignals = {
  serverUp: true,
  companionConnected: false,
  deployed: true,
  stale: false,
  instanceRunning: false,
}

const graph = { id: 'g', chapters: [{ id: 'c1' }] } as unknown as QuestGraphData

function cleanReport(): PackHealthReport {
  return {
    sections: [],
    blockingCount: 0,
    recommendedCount: 0,
    optionalCount: 0,
    go: true,
    stats: { indexedItems: 42, itemCoverage: 1 },
  } as PackHealthReport
}

beforeEach(() => {
  mockReport = cleanReport()
  mockGraph = graph
})

describe('BeginnerHintStrip', () => {
  it('renders the four wedge steps in order', () => {
    render(<BeginnerHintStrip connection={offline} onJumpToTab={vi.fn()} />)
    const titles = screen.getAllByText(/Follow the guide|Save your work|Pack Health|Launch your pack/)
    expect(titles).toHaveLength(4)
  })

  it('offers a jump button on steps with a destination', () => {
    render(<BeginnerHintStrip connection={offline} onJumpToTab={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Open Quests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Health' })).toBeInTheDocument()
  })

  it('does not offer a jump button on pointer steps (save, launch)', () => {
    render(<BeginnerHintStrip connection={offline} onJumpToTab={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('jumps to the tab the button names', () => {
    const onJumpToTab = vi.fn()
    render(<BeginnerHintStrip connection={offline} onJumpToTab={onJumpToTab} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Health' }))
    expect(onJumpToTab).toHaveBeenCalledWith('health')
    fireEvent.click(screen.getByRole('button', { name: 'Open Quests' }))
    expect(onJumpToTab).toHaveBeenCalledWith('quests')
  })

  it('shows the attention state when health finds blocking problems', () => {
    mockReport = { ...cleanReport(), blockingCount: 1, go: false } as PackHealthReport
    render(<BeginnerHintStrip connection={offline} onJumpToTab={vi.fn()} />)
    expect(screen.getByText('Needs a look')).toBeInTheDocument()
    expect(screen.getByText(/1 problem must be fixed/)).toBeInTheDocument()
  })

  it('shows green when the companion is connected (health + launch both green)', () => {
    render(
      <BeginnerHintStrip
        connection={{ ...offline, companionConnected: true, instanceRunning: true }}
        onJumpToTab={vi.fn()}
      />,
    )
    expect(screen.getAllByText('Good')).toHaveLength(2)
    expect(screen.getByText(/companion is connected/)).toBeInTheDocument()
  })

  it('points at the quest book without claiming completion', () => {
    mockGraph = null
    render(<BeginnerHintStrip connection={offline} onJumpToTab={vi.fn()} />)
    expect(screen.getByText(/build your quest book/)).toBeInTheDocument()
  })
})
