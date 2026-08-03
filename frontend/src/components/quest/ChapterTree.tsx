import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { QuestChapter, QuestChapterGroup } from '../../services/api';
import { GroupNodeComponent, GROUP_HEIGHT } from './chapter-groups';
import { ChapterNodeComponent, CHAPTER_NODE_HEIGHT } from './chapter-node';
import { stripMcFormatting } from '../../core/theme/font-formatter';

interface ChapterTreeProps {
  chapters: QuestChapter[];
  chapterGroups: QuestChapterGroup[];
  activeChapter: string | null;
  questCounts: Record<string, number>;
  chapterIcons: Record<string, string | undefined>;
  chapterIconKeys: Record<string, string | undefined>;
  collapsedGroups: Record<string, boolean>;
  onSelectChapter: (id: string) => void;
  onToggleGroup: (id: string) => void;
  onAddChapter: () => void;
  onEditChapter?: (id: string) => void;
  onAddGroup?: () => void;
  onEditGroup?: (id: string) => void;
  onRenameChapter?: (id: string, title: string) => void;
  onMoveChapter?: (id: string, dir: -1 | 1) => void;
}

const INDENT = 20;
const HEADER_HEIGHT = 36;
const PADDING = 4;

const nodeTypes = {
  group: GroupNodeComponent,
  chapter: ChapterNodeComponent,
};

function ChapterTreeInner({
  chapters,
  chapterGroups,
  activeChapter,
  questCounts,
  collapsedGroups,
  chapterIcons,
  chapterIconKeys,
  onSelectChapter,
  onToggleGroup,
  onAddChapter,
  onEditChapter,
  onAddGroup,
  onEditGroup,
  onRenameChapter,
  onMoveChapter,
}: ChapterTreeProps) {
  // Global display order (matches onMoveChapter's swap semantics).
  const orderIndexById = useMemo(() => {
    const map: Record<string, number> = {};
    [...chapters]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .forEach((c, i) => { map[c.id] = i; });
    return map;
  }, [chapters]);

  const { nodes: layoutNodes, edges: layoutEdges, totalHeight } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = PADDING;

    const groupedChapters = chapters.filter(c => c.group_id);
    const ungroupedChapters = chapters.filter(c => !c.group_id);
    const sortedGroups = [...chapterGroups].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const byOrder = (a: QuestChapter, b: QuestChapter) => (a.order_index || 0) - (b.order_index || 0);

    const chapterData = (ch: QuestChapter) => ({
      label: stripMcFormatting(ch.title) || 'Untitled',
      iconUrl: chapterIcons[ch.id],
      iconKey: chapterIconKeys[ch.id],
      questCount: questCounts[ch.id] || 0,
      isActive: activeChapter === ch.id,
      canMoveUp: (orderIndexById[ch.id] ?? 0) > 0,
      canMoveDown: (orderIndexById[ch.id] ?? 0) < chapters.length - 1,
      onRename: onRenameChapter ? (title: string) => onRenameChapter(ch.id, title) : undefined,
      onEditChapter: onEditChapter ? () => onEditChapter(ch.id) : undefined,
      onMoveChapter: onMoveChapter ? (dir: -1 | 1) => onMoveChapter(ch.id, dir) : undefined,
    });

    for (const ch of [...ungroupedChapters].sort(byOrder)) {
      nodes.push({
        id: ch.id,
        type: 'chapter',
        position: { x: 0, y },
        data: chapterData(ch),
        style: { width: 220, height: CHAPTER_NODE_HEIGHT },
      });
      y += CHAPTER_NODE_HEIGHT;
    }

    for (const group of sortedGroups) {
      const groupId = `group:${group.id}`;
      const members = groupedChapters.filter(c => c.group_id === group.id).sort(byOrder);
      const isCollapsed = collapsedGroups[group.id] === true;

      nodes.push({
        id: groupId,
        type: 'group',
        position: { x: 0, y },
        data: {
          label: stripMcFormatting(group.title) || 'Group',
          isCollapsed,
          memberCount: members.length,
        },
        style: { width: 220, height: GROUP_HEIGHT },
      });
      y += GROUP_HEIGHT;

      if (!isCollapsed) {
        for (const ch of members) {
          nodes.push({
            id: ch.id,
            type: 'chapter',
            position: { x: INDENT, y },
            data: chapterData(ch),
            style: { width: 200, height: CHAPTER_NODE_HEIGHT },
          });
          edges.push({
            id: `edge:${group.id}:${ch.id}`,
            source: groupId,
            target: ch.id,
            type: 'default',
            style: { stroke: 'var(--ftb-border)', strokeWidth: 1, opacity: 0.4 },
          });
          y += CHAPTER_NODE_HEIGHT;
        }
      }
    }

    nodes.push({
      id: '__add_chapter__',
      type: 'chapter',
      position: { x: 0, y },
      data: { label: '+ Add Chapter', isAddButton: true, isActive: false },
      style: { width: 220, height: CHAPTER_NODE_HEIGHT },
    });
    y += CHAPTER_NODE_HEIGHT;

    nodes.push({
      id: '__add_group__',
      type: 'chapter',
      position: { x: 0, y },
      data: { label: '+ Add Group', isAddButton: true, isActive: false },
      style: { width: 220, height: CHAPTER_NODE_HEIGHT },
    });
    y += CHAPTER_NODE_HEIGHT + PADDING;

    return { nodes, edges, totalHeight: y };
  }, [chapters, chapterGroups, activeChapter, questCounts, collapsedGroups, chapterIcons, chapterIconKeys, orderIndexById, onRenameChapter, onEditChapter, onMoveChapter]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === '__add_chapter__') {
        onAddChapter();
        return;
      }
      if (node.id === '__add_group__') {
        onAddGroup?.();
        return;
      }
      if (node.type === 'group') {
        const groupId = node.id.replace('group:', '');
        onToggleGroup(groupId);
        return;
      }
      onSelectChapter(node.id);
    },
    [onSelectChapter, onToggleGroup, onAddChapter, onAddGroup]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'group') {
        const groupId = node.id.replace('group:', '');
        onEditGroup?.(groupId);
        return;
      }
      if (node.type === 'chapter' && node.id !== '__add_chapter__' && node.id !== '__add_group__') {
        onEditChapter?.(node.id);
      }
    },
    [onEditChapter, onEditGroup]
  );

  return (
    <div style={{ width: 250, height: '100%', background: 'var(--ftb-surface)', display: 'flex', flexDirection: 'column' }}>
      <div
        className="ch-tree-header"
        style={{
          height: HEADER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          background: 'var(--ftb-surface-alt)',
          borderBottom: '2px solid var(--ftb-border)',
          color: 'var(--ftb-accent)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          flexShrink: 0,
        }}
      >
        Chapters ({chapters.length})
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={1}
          maxZoom={1}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          style={{ minHeight: totalHeight, overflow: 'visible' }}
          proOptions={{ hideAttribution: true }}
        >
        </ReactFlow>
      </div>
    </div>
  );
}

export function ChapterTree(props: ChapterTreeProps) {
  return (
    <ReactFlowProvider>
      <ChapterTreeInner {...props} />
    </ReactFlowProvider>
  );
}

export default ChapterTree;
