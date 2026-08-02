// Pure quest-search matching. Filters a chapter's quest nodes by a free-text
// query against label, id, subtitle, and each objective's label/target.
import type { QuestNodeData } from '../../services/quest-types';

export function searchQuestNodes(nodes: QuestNodeData[], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const matches = new Set<string>();
  if (!q) return matches;
  for (const n of nodes) {
    const haystack = [
      n.label || '',
      n.id,
      n.subtitle || '',
      ...(n.objectives || []).map((o) => o.label || ''),
      ...(n.objectives || []).map((o) => o.target || ''),
    ]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) matches.add(n.id);
  }
  return matches;
}
