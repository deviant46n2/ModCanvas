import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { DependencyEdge, detectCycles } from './quest-edges';
import { EDGE_CASING, EDGE_DASH_ARRAY, EDGE_STATE_COLORS, MARCH_FAST_CLASS, MARCH_SLOW_CLASS } from '../../core/quest/edge-state';

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
  it('draws a straight line between the quest centers', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    // Center-to-center straight path — no bezier control points.
    expect(core!.getAttribute('d')).toBe('M 0 0 L 100 50');
  });

  it('renders a dark casing stroke under the bright core for legibility', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} style={{ stroke: EDGE_STATE_COLORS.completed, strokeWidth: 6.1, opacity: 1, strokeDasharray: EDGE_DASH_ARRAY }} />
      </svg>
    );
    const casing = container.querySelector('.quest-edge-casing');
    const core = container.querySelector('.react-flow__edge-path');
    expect(casing).not.toBeNull();
    expect(core).not.toBeNull();
    expect(casing!.getAttribute('stroke')).toBe(EDGE_CASING);
    expect(Number(casing!.getAttribute('stroke-width'))).toBeGreaterThan(
      Number((core as unknown as SVGPathElement).style.strokeWidth)
    );
  });

  it('marching state edges carry the slow march class and dash pattern', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} style={{ stroke: EDGE_STATE_COLORS.uncompleted, strokeWidth: 3, opacity: 0.706, strokeDasharray: EDGE_DASH_ARRAY }} data={{ state: 'uncompleted', march: 'slow' }} />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    expect(core!.getAttribute('class')).toContain(MARCH_SLOW_CLASS);
    expect((core as unknown as SVGPathElement).style.strokeDasharray).toBe(EDGE_DASH_ARRAY);
    // jsdom normalizes rgba with alpha fraction.
    expect((core as unknown as SVGPathElement).style.stroke).toMatch(/^rgba?\(204, 163, 163/);
  });

  it('fan edges use the fast march class', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} style={{ stroke: EDGE_STATE_COLORS.requires, strokeWidth: 3, opacity: 1, strokeDasharray: EDGE_DASH_ARRAY }} data={{ state: 'requires', march: 'fast' }} />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    expect(core!.getAttribute('class')).toContain(MARCH_FAST_CLASS);
  });

  it('switches to the cycle palette for circular dependencies: solid, red, static, arrowed', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} style={{ stroke: EDGE_STATE_COLORS.cycle, strokeWidth: 3.5, opacity: 1 }} data={{ state: 'cycle', march: null }} markerEnd="url('#arrow')" />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    expect((core as unknown as SVGPathElement).style.stroke).toBe('rgb(248, 113, 113)');
    // Solid: no dash pattern, no march class.
    expect((core as unknown as SVGPathElement).style.strokeDasharray).toBe('');
    expect(core!.getAttribute('class')).not.toContain(MARCH_SLOW_CLASS);
    expect(core!.getAttribute('class')).not.toContain(MARCH_FAST_CLASS);
    // Cycle edges keep an arrowhead so loop direction stays readable.
    expect(core!.getAttribute('marker-end')).toBe("url('#arrow')");
    const title = container.querySelector('title');
    expect(title?.textContent).toContain('Circular dependency');
  });

  it('renders no arrowhead on state edges — direction comes from the march', () => {
    const { container } = render(
      <svg>
        <DependencyEdge {...baseProps} markerEnd={undefined} />
      </svg>
    );
    const core = container.querySelector('.react-flow__edge-path');
    expect(core!.getAttribute('marker-end')).toBeNull();
  });
});
