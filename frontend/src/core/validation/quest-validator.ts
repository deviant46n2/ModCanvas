export interface ValidationIssue {
  nodeId: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface QuestValidationEdge {
  source: string;
  target: string;
}

export interface QuestValidationNode {
  id: string;
  dependencies: string[];
}

export interface QuestValidationGraph {
  nodes: QuestValidationNode[];
  edges: QuestValidationEdge[];
}

export function validateQuestGraph(graph: QuestValidationGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map(n => n.id));

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source);
    if (list) list.push(edge.target);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({
        nodeId: edge.source,
        severity: 'error',
        message: `Edge references unknown source node: ${edge.source}`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        nodeId: edge.target,
        severity: 'error',
        message: `Edge references unknown target node: ${edge.target}`,
      });
    }
  }

  for (const node of graph.nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        issues.push({
          nodeId: node.id,
          severity: 'error',
          message: `Depends on unknown node: ${dep}`,
        });
      }
    }
  }

  const cycles = findCycles(graph.edges);
  for (const cycle of cycles) {
    for (const nodeId of cycle) {
      issues.push({
        nodeId,
        severity: 'error',
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
      });
    }
  }

  return issues;
}

export function findCycles(edges: QuestValidationEdge[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    graph.get(edge.source)!.push(edge.target);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}
