import { describe, it, expect } from 'vitest';
import { validateQuestGraph, findCycles } from './quest-validator';

describe('findCycles — Cycle Detection', () => {
  it('should return empty for a DAG', () => {
    const cycles = findCycles([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]);
    expect(cycles).toHaveLength(0);
  });

  it('should detect a simple 2-node cycle', () => {
    const cycles = findCycles([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ]);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
  });

  it('should detect a 3-node cycle', () => {
    const cycles = findCycles([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should handle self-loop', () => {
    const cycles = findCycles([
      { source: 'a', target: 'a' },
    ]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should return empty for empty input', () => {
    const cycles = findCycles([]);
    expect(cycles).toHaveLength(0);
  });
});

describe('validateQuestGraph — Graph Validation', () => {
  it('should pass on a valid graph', () => {
    const issues = validateQuestGraph({
      nodes: [{ id: 'a', dependencies: [] }, { id: 'b', dependencies: ['a'] }],
      edges: [{ source: 'a', target: 'b' }],
    });
    expect(issues).toHaveLength(0);
  });

  it('should flag unknown source node in edge', () => {
    const issues = validateQuestGraph({
      nodes: [{ id: 'a', dependencies: [] }],
      edges: [{ source: 'unknown', target: 'a' }],
    });
    expect(issues.some(i => i.message.includes('unknown source'))).toBe(true);
  });

  it('should flag unknown target node in edge', () => {
    const issues = validateQuestGraph({
      nodes: [{ id: 'a', dependencies: [] }],
      edges: [{ source: 'a', target: 'unknown' }],
    });
    expect(issues.some(i => i.message.includes('unknown target'))).toBe(true);
  });

  it('should flag missing dependency', () => {
    const issues = validateQuestGraph({
      nodes: [{ id: 'a', dependencies: ['missing'] }],
      edges: [],
    });
    expect(issues.some(i => i.message.includes('Depends on unknown'))).toBe(true);
  });

  it('should flag circular dependencies', () => {
    const issues = validateQuestGraph({
      nodes: [
        { id: 'a', dependencies: ['b'] },
        { id: 'b', dependencies: ['a'] },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
    });
    expect(issues.some(i => i.message.includes('Circular dependency'))).toBe(true);
  });

  it('should report errors with error severity', () => {
    const issues = validateQuestGraph({
      nodes: [{ id: 'a', dependencies: [] }],
      edges: [{ source: 'a', target: 'ghost' }],
    });
    expect(issues[0].severity).toBe('error');
  });

  it('should handle empty graph', () => {
    const issues = validateQuestGraph({ nodes: [], edges: [] });
    expect(issues).toHaveLength(0);
  });
});
