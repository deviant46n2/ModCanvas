import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge, NodeProps } from '@xyflow/react';
import type { QuestChapter, QuestChapterGroup } from '../../services/api';
import { GroupNodeComponent, GROUP_HEIGHT } from './chapter-groups';
import { stripMcFormatting } from '../../core/theme/font-formatter';
import { AnimatedSprite } from './AnimatedSprite';

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
}

const NODE_HEIGHT = 40;
const INDENT = 20;
const HEADER_HEIGHT = 36;
const PADDING = 4;

function ChapterNodeComponent({ data }: NodeProps) {
  const d = data as any;
  const label = d.label || 'Untitled';
  const iconUrl = d.iconUrl as string | undefined;
  const iconKey = d.iconKey as string | undefined;
  const questCount = d.questCount as number;
  const isActive = d.isActive as boolean;
  const isAddButton = d.isAddButton as boolean;

  return (
    <div
      className={`ch-tree-chapter ${isActive ? 'active' : ''}`}
      title={isAddButton ? undefined : 'Double-click to edit chapter settings'}
      style={{
        height: NODE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px 0 12px',
        cursor: 'pointer',
        userSelect: 'none',
        borderLeft: isActive ? '3px solid var(--ftb-accent)' : '3px solid transparent',
        background: isActive ? 'var(--ftb-surface-alt)' : 'transparent',
        transition: 'background 0.1s, border-left-color 0.1s',
      }}
    >
      <span
        className="ch-tree-icon"
        style={{
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
          flexShrink: 0,
          background: 'var(--ftb-input-bg)',
          border: '1px solid var(--ftb-border)',
          imageRendering: 'pixelated',
        }}
      >
        {iconUrl ? (
          <AnimatedSprite url={iconUrl} textureKey={iconKey} width={16} height={16} alt="" style={{ objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 12 }}>📖</span>
        )}
      </span>
      <span
        className="ch-tree-chapter-title"
        style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 500,
          color: isActive ? 'var(--ftb-accent)' : 'var(--ftb-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        className="ch-tree-chapter-count"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: isActive ? 'var(--ftb-bg)' : 'var(--ftb-bg)',
          background: isActive ? 'var(--ftb-accent)' : 'var(--ftb-border)',
          padding: '0 6px',
          lineHeight: '16px',
          minWidth: 16,
          textAlign: 'center',
        }}
      >
        {questCount}
      </span>
    </div>
  );
}

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
}: ChapterTreeProps) {

  const { nodes: layoutNodes, edges: layoutEdges, totalHeight } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = PADDING;

    const groupedChapters = chapters.filter(c => c.group_id);
    const ungroupedChapters = chapters.filter(c => !c.group_id);
    const sortedGroups = [...chapterGroups].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const byOrder = (a: QuestChapter, b: QuestChapter) => (a.order_index || 0) - (b.order_index || 0);

    for (const ch of [...ungroupedChapters].sort(byOrder)) {
      nodes.push({
        id: ch.id,
        type: 'chapter',
        position: { x: 0, y },
        data: {
          label: stripMcFormatting(ch.title) || 'Untitled',
          iconUrl: chapterIcons[ch.id],
          iconKey: chapterIconKeys[ch.id],
          questCount: questCounts[ch.id] || 0,
          isActive: activeChapter === ch.id,
        },
        style: { width: 220, height: NODE_HEIGHT },
      });
      y += NODE_HEIGHT;
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
            data: {
              label: stripMcFormatting(ch.title) || 'Untitled',
              iconUrl: chapterIcons[ch.id],
              iconKey: chapterIconKeys[ch.id],
              questCount: questCounts[ch.id] || 0,
              isActive: activeChapter === ch.id,
            },
            style: { width: 200, height: NODE_HEIGHT },
          });
          edges.push({
            id: `edge:${group.id}:${ch.id}`,
            source: groupId,
            target: ch.id,
            type: 'default',
            style: { stroke: 'var(--ftb-border)', strokeWidth: 1, opacity: 0.4 },
          });
          y += NODE_HEIGHT;
        }
      }
    }

    nodes.push({
      id: '__add_chapter__',
      type: 'chapter',
      position: { x: 0, y },
      data: { label: '+ Add Chapter', isAddButton: true, isActive: false },
      style: { width: 220, height: NODE_HEIGHT },
    });
    y += NODE_HEIGHT;

    nodes.push({
      id: '__add_group__',
      type: 'chapter',
      position: { x: 0, y },
      data: { label: '+ Add Group', isAddButton: true, isAddGroupButton: true, isActive: false },
      style: { width: 220, height: NODE_HEIGHT },
    });
    y += NODE_HEIGHT + PADDING;

    return { nodes, edges, totalHeight: y };
  }, [chapters, chapterGroups, activeChapter, questCounts, collapsedGroups, chapterIcons, chapterIconKeys]);

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
