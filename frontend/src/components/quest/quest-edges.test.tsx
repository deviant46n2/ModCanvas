import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { DependencyEdge, detectCycles, CYCLE_COLOR } from './quest-edges';

const baseProps = {
  id: 'e1',
  source: 'a',
  target: 'b',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 50,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  markerEnd: "url('#arrow')",
};

describe('detectCycles', () => {
  it('flags edges that participate in a dependency loop', () => {
    const cycles = detectCycles([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ]);
    expect(cycles.has('a->b')).toBe(true);
    expect(cycles.has('b->c')).toBe(true);
    expect(cycles.has('c->a')).toBe(true);
  });

  it('does not flag acyclic graphs', () => {
    const cycles = detectCycles([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]);
    expect(cycles.size).toBe(0);
  });
});

describe('DependencyEdge', () => {
  it('renders a dark casing stroke under the bright core for legibility', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} />
      </svg>
    );
    const casing = container.querySelector('.quest-edge-casing');
    const core = container.querySelector('.react-flow__edge-path');
    expect(casing).not.toBeNull();
    expect(core).not.toBeNull();
    expect(casing!.getAttribute('stroke')).toBe('rgba(10, 12, 18, 0.92)');
    // jsdom normalizes hex → rgb.
    expect((core as unknown as SVGPathElement).style.stroke).toBe('rgb(242, 201, 76)');
    // Casing is always wider than the core so it reads as an outline.
    expect(Number(casing!.getAttribute('stroke-width'))).toBeGreaterThan(
      Number((core as unknown as SVGPathElement).style.strokeWidth)
    );
    // The marker (arrowhead) is forwarded straight through.
    expect(core!.getAttribute('marker-end')).toBe("url('#arrow')");
  });

  it('renders a source dot on the prerequisite end plus a midpoint direction chevron', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} />
      </svg>
    );
    const dot = container.querySelector('.quest-edge-source-dot');
    const chevron = container.querySelector('.quest-edge-chevron');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute('cx')).toBe('0');
    expect(dot!.getAttribute('cy')).toBe('0');
    expect(chevron).not.toBeNull();
    expect(chevron!.getAttribute('fill')).toBe('#f2c94c');
    const d = chevron!.getAttribute('d');
    expect(d).toMatch(/^M \S+ \S+ L /);
  });

  it('switches to the cycle palette for circular dependencies', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} style={{ stroke: CYCLE_COLOR, strokeWidth: 3.5, opacity: 1 }} />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    // jsdom normalizes hex → rgb.
    expect((core as unknown as SVGPathElement).style.stroke).toBe('rgb(255, 107, 107)');
    const title = container.querySelector('title');
    expect(title?.textContent).toContain('Circular dependency');
  });
});
