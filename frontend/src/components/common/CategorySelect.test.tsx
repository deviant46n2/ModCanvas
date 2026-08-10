import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategorySourceHint } from './CategorySelect'

describe('CategorySourceHint', () => {
  it('renders the pause notice when a category is active with CurseForge selected (ef53cd8)', () => {
    render(<CategorySourceHint categoryActive curseForgeActive />)
    expect(screen.getByRole('status')).toHaveTextContent(
      /curseforge is paused/i,
    )
  })

  it('renders nothing without a category', () => {
    const { container } = render(
      <CategorySourceHint categoryActive={false} curseForgeActive />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when CurseForge is not a selected source', () => {
    const { container } = render(
      <CategorySourceHint categoryActive curseForgeActive={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
