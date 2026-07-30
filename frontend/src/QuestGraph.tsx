import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react'
import type { Connection, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './QuestGraph.css'
import './components/QuestTile.css'
import { QuestTileComponent } from './components/QuestTile'
import {
  getQuestGraph,
  saveQuestGraph,
  analyzeQuestGraph,
  importFtbQuestsFromDir,
  exportFtbQuestsToDir,
  scanModJarTextures,
} from './services/api'
import type {
  QuestGraphData,
  QuestAnalysis,
  QuestChapter,
  QuestChapterGroup,
  QuestObjectiveData,
  QuestRewardData,
  QuestNodeData,
  QuestSize,
} from './services/api'
import type { QuestTileData } from './components/QuestTile'
import { open } from '@tauri-apps/plugin-dialog'

// ─── Auto-layout function ───────────────────────────────────────────────────

const CHAPTER_SPACING_X = 250
const QUEST_SPACING_Y = 160

function autoLayoutNodes(nodes: Node[], chapters: QuestGraphData['chapters']): Node[] {
  if (!chapters || chapters.length === 0) return nodes
  
  // Build a map of chapter -> quests
  const chapterQuests: Record<string, Node[]> = {}
  for (const node of nodes) {
    if (node.type === 'chapter') continue
    const chId = (node.data?.chapter_id as string) || chapters[0]?.id || 'default'
    if (!chapterQuests[chId]) chapterQuests[chId] = []
    chapterQuests[chId].push(node)
  }
  
  // Position each chapter's quests
  const result = nodes.map(node => {
    if (node.type === 'chapter') return node
    
    const chId = (node.data?.chapter_id as string) || chapters[0]?.id || 'default'
    const chIndex = chapters.findIndex(c => c.id === chId)
    const questsInChapter = chapterQuests[chId] || []
    const questIndex = questsInChapter.findIndex(q => q.id === node.id)
    
    // Calculate position based on chapter and quest index
    const x = (chIndex >= 0 ? chIndex : 0) * CHAPTER_SPACING_X + 100
    const y = questIndex * QUEST_SPACING_Y + 100
    
    // Only auto-position if at origin (0,0) or very close
    const currentX = node.position.x
    const currentY = node.position.y
    if (Math.abs(currentX) < 10 && Math.abs(currentY) < 10) {
      return { ...node, position: { x, y } }
    }
    return node
  })
  
  return result
}

// ─── Rust-matching TypeScript interfaces ───────────────────────────────────

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve an FTB Quests icon reference to a texture index key.
 * Handles formats like:
 * - "minecraft:diamond" -> "minecraft:diamond"
 * - "modid:block/blockname" -> "modid:blockname"
 * - "modid:item/itemname" -> "modid:itemname"
 * - "modid:blockname" -> "modid:blockname"
 * - "itemname" (no namespace) -> "minecraft:itemname"
 */
function defaultObjective(): QuestObjectiveData {
  return {
    id: generateFtbHexId(),
    label: '',
    objective_type: 'item_acquisition',
    target: '',
    target_count: 1,
    required: true,
    item_tag: '', nbt_data: '', consume_items: false,
    match_nbt: false, ignore_nbt: false, exact_match: false,
    fluid_id: '', fluid_amount: 0, energy_amount: 0, energy_unit: 'FE',
    xp_levels: 0, xp_points: 0, command: '', dimension: '',
    x: 0, y: 0, z: 0, radius: 0,
    entity_id: '', advancement_id: '', custom_json: '', description: '',
    stat_name: '', stat_value: 0, biome_id: '', structure_id: '',
    observation_range: 4,
  }
}

function defaultReward(): QuestRewardData {
  return {
    id: generateFtbHexId(),
    label: '',
    reward_type: 'item',
    items: [],
    description: '',
    item_id: '', item_tag: '', item_count: 1, nbt_data: '',
    xp_amount: 0, xp_levels: 0, command: '', loot_table: '',
    game_stage: '', weight: 1.0, reward_chests: [], team_reward: false,
    toast_message: '', table_id: '', choices: [], advancement_id: '',
  }
}

const OBJECTIVE_TYPES = [
  { value: 'item_acquisition', label: 'Item Detection' },
  { value: 'item_retrieval', label: 'Item Retrieval' },
  { value: 'item_crafting', label: 'Item Crafting' },
  { value: 'block_break', label: 'Block Breaking' },
  { value: 'block_place', label: 'Block Placing' },
  { value: 'entity_kill', label: 'Entity Kill' },
  { value: 'location_visit', label: 'Location Visit' },
  { value: 'advancement', label: 'Advancement' },
  { value: 'observation', label: 'Observation' },
  { value: 'visit_biome', label: 'Visit Biome' },
  { value: 'find_structure', label: 'Find Structure' },
  { value: 'fluid', label: 'Fluid Detection' },
  { value: 'energy', label: 'Energy Detection' },
  { value: 'xp', label: 'Experience' },
  { value: 'stat', label: 'Statistics' },
  { value: 'command', label: 'Command' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'checkmark', label: 'Checkmark' },
  { value: 'custom', label: 'Custom' },
]

const REWARD_TYPES = [
  { value: 'item', label: 'Item Reward' },
  { value: 'choice', label: 'Choice Reward' },
  { value: 'item_weighted', label: 'Weighted Item' },
  { value: 'random', label: 'Random Reward' },
  { value: 'all_table', label: 'All Table Reward' },
  { value: 'loot_table', label: 'Loot Reward' },
  { value: 'experience', label: 'XP Reward' },
  { value: 'xp_levels', label: 'XP Levels Reward' },
  { value: 'command', label: 'Command Reward' },
  { value: 'advancement', label: 'Advancement Reward' },
  { value: 'toast', label: 'Toast Notification' },
  { value: 'unlock', label: 'Stage Unlock' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'custom', label: 'Custom' },
]

const SHAPES = [
  { value: 'Default', label: 'Default' },
  { value: 'Circle', label: 'Circle' },
  { value: 'Square', label: 'Square' },
  { value: 'RoundedSquare', label: 'Rounded Square' },
  { value: 'Diamond', label: 'Diamond' },
  { value: 'Pentagon', label: 'Pentagon' },
  { value: 'Hexagon', label: 'Hexagon' },
  { value: 'Octagon', label: 'Octagon' },
  { value: 'Heart', label: 'Heart' },
  { value: 'Gear', label: 'Gear' },
]

// ─── FTB Quests ID Generation ───────────────────────────────────────────────

function generateFtbHexId(): string {
  // FTB Quests uses 16-character uppercase hex strings (e.g., "1A2B3C4D5E6F7A8B")
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
}

// ─── Icon Key Resolution ──────────────────────────────────────────────────────
// FTB Quests icons can be in various formats:
// - "minecraft:diamond" (already an item ID)
// - "modid:block/blockname" -> "modid:blockname"
// - "modid:item/itemname" -> "modid:itemname"
// - "modid:textures/item/itemname.png" -> "modid:itemname"
// - "itemname" (bare) -> "minecraft:itemname"
function resolveIconKey(icon: string): string {
  // Already a simple item ID (contains : but no /)
  if (icon.includes(':') && !icon.includes('/')) {
    return icon;
  }
  // Handle bare names (no namespace)
  if (!icon.includes(':')) {
    return `minecraft:${icon}`;
  }
  // Handle FTB Quests texture paths like "modid:block/blockname" or "modid:item/itemname"
  const parts = icon.split(':');
  if (parts.length === 2) {
    const namespace = parts[0];
    let path = parts[1];
    // Strip common prefixes
    path = path
      .replace(/^textures\/(item|block)\//, '')
      .replace(/\.png$/, '');
    // Handle block/ or item/ prefix
    if (path.startsWith('block/')) {
      return `${namespace}:${path.substring(6)}`;
    }
    if (path.startsWith('item/')) {
      return `${namespace}:${path.substring(5)}`;
    }
    return `${namespace}:${path}`;
  }
  return icon;
}

const PROGRESSION_MODES = [
  { value: 'Default', label: 'Inherit from Chapter' },
  { value: 'Linear', label: 'Linear (must complete in order)' },
  { value: 'Flexible', label: 'Flexible (any order)' },
]

const DEPENDENCY_REQUIREMENTS = [
  { value: 'AllCompleted', label: 'All Completed' },
  { value: 'OneCompleted', label: 'One Completed' },
  { value: 'AllStarted', label: 'All Started' },
  { value: 'OneStarted', label: 'One Started' },
]

const VISIBILITY_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'AlwaysVisible', label: 'Always Visible' },
  { value: 'NeverVisible', label: 'Never Visible' },
  { value: 'WhenDependenciesComplete', label: 'When Deps Complete' },
  { value: 'WhenQuestComplete', label: 'When Quest Complete' },
  { value: 'WhenAllComplete', label: 'When All Complete' },
]

// ─── Main Component ────────────────────────────────────────────────────────

interface QuestGraphProps {
  projectId: string
  projectPath?: string
}

export default function QuestGraph({ projectId, projectPath }: QuestGraphProps) {
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
  const [analysis, setAnalysis] = useState<QuestAnalysis | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showGroups, setShowGroups] = useState(false)
  const [editGroups, setEditGroups] = useState<QuestChapterGroup[]>([])
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [editBookProgressionMode, setEditBookProgressionMode] = useState('Default')
  const [editBookIcon, setEditBookIcon] = useState('')
  const [editBookBgImage, setEditBookBgImage] = useState('')
  const [editQuestColor, setEditQuestColor] = useState('')
  const [editDefaultQuestWidth, setEditDefaultQuestWidth] = useState(24)
  const [editDefaultQuestHeight, setEditDefaultQuestHeight] = useState(24)
  const [editDefaultQuestShape, setEditDefaultQuestShape] = useState('Default')
  const [modsDir, setModsDir] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerSearch, setIconPickerSearch] = useState('')

  // ─── Chapter sidebar state ─────────────────────────────────────────────
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const importedRef = useRef(false)

  // ─── Context menu ──────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)

  // ─── Clipboard for copy/paste ──────────────────────────────────────────
  const [clipboard, setClipboard] = useState<Node | null>(null)

  // ─── Viewport / cursor tracking ────────────────────────────────────────
  const [viewportPos, setViewportPos] = useState({ x: 0, y: 0, zoom: 1 })

  // ─── Inspector panel state ─────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<'general' | 'objectives' | 'rewards' | 'advanced'>('general')

  // Popup edit states
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editVisibility, setEditVisibility] = useState('Normal')
  const [editOptional, setEditOptional] = useState(false)
  const [editRepeatable, setEditRepeatable] = useState(false)
  const [editSilentComplete, setEditSilentComplete] = useState(false)
  const [editRepeatTime, setEditRepeatTime] = useState(0)
  const [editRepeatMinDelay, setEditRepeatMinDelay] = useState(0)
  const [editRepeatMaxDelay, setEditRepeatMaxDelay] = useState(0)
  const [editIcon, setEditIcon] = useState('')
  const [editHideDeps, setEditHideDeps] = useState(false)
  const [editHideQuest, setEditHideQuest] = useState(false)
  const [editHideAll, setEditHideAll] = useState(false)
  const [editDisableReward, setEditDisableReward] = useState(false)
  const [editPauseReward, setEditPauseReward] = useState(false)
  const [editShape, setEditShape] = useState('Default')
  const [editIconScaling, setEditIconScaling] = useState(1.0)
  const [editTags, setEditTags] = useState('')
  const [editProgressionMode, setEditProgressionMode] = useState('Default')
  const [editSequentialTasks, setEditSequentialTasks] = useState(false)
  const [editDisableToast, setEditDisableToast] = useState(false)
  const [editIgnoreRewardBlocking, setEditIgnoreRewardBlocking] = useState(false)
  const [editDisableJei, setEditDisableJei] = useState(false)
  const [editHideDetailsUntilStartable, setEditHideDetailsUntilStartable] = useState(false)
  const [editHideTextUntilCompleted, setEditHideTextUntilCompleted] = useState(false)
  const [editInvisibleUntilCompleted, setEditInvisibleUntilCompleted] = useState(false)
  const [editInvisibleUntilXTasks, setEditInvisibleUntilXTasks] = useState(0)
  const [editHideDepLines, setEditHideDepLines] = useState(false)
  const [editHideDeptLines, setEditHideDeptLines] = useState(false)
  const [editMinReqDeps, setEditMinReqDeps] = useState(0)
  const [editDepRequirement, setEditDepRequirement] = useState('AllCompleted')

  // ─── Textures & icon picker ────────────────────────────────────────────

  const setModsDirPersisted = useCallback((dir: string) => {
    setModsDir(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

  const browseModsDir = useCallback(async () => {
    const modsPath = projectPath ? `${projectPath}/mods` : ''
    if (!modsPath) {
      alert('No project path available')
      return
    }
    try {
      setModsDirPersisted(modsPath)
      const idx = await scanModJarTextures(modsPath)
      setTextureIndex(idx)
      const count = Object.keys(idx).length
      alert(`Loaded ${count} textures from ${modsPath}`)
    } catch (e) {
      console.error('Mods Dir error:', e)
      alert(`Failed to scan ${modsPath}: ${e}`)
    }
  }, [projectPath, setModsDirPersisted])

  const openIconPicker = useCallback(() => {
    setIconPickerSearch('')
    setShowIconPicker(true)
  }, [])

  // Reset import guard when project changes
  useEffect(() => {
    importedRef.current = false
  }, [projectId])

  useEffect(() => {
    if (modsDir) {
      scanModJarTextures(modsDir).then((idx) => {
        setTextureIndex(idx)
        console.log(`[ModCanvas] Loaded ${Object.keys(idx).length} textures from mods dir`)
      }).catch((e) => console.error('Failed to scan textures:', e))
    }
  }, [modsDir])

  // ─── ReactFlow state ───────────────────────────────────────────────────

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Ref for saveGraph to break circular dependency
  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)
  saveGraphRef.current = async () => {
    if (!graph) return
    const SCALE = 48
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: nodes.map((n) => ({
        id: n.id,
        node_type: (n.data?.nodeType as string) || 'quest',
        label: (n.data?.label as string) || 'New Quest',
        description: (n.data?.description as string) || '',
        position: { x: n.position.x / SCALE, y: n.position.y / SCALE },
        data: {},
        objectives: (n.data?.objectives as QuestObjectiveData[]) || [],
        rewards: (n.data?.rewards as QuestRewardData[]) || [],
        required_items: (n.data?.required_items as string[]) || [],
        chapter_id: (n.data?.chapter_id as string) || null,
        icon: (n.data?.icon as string) || '',
        size: (n.data?.size as QuestSize) || { width: 24, height: 24 },
        color: (n.data?.color as string) || '',
        visibility: (n.data?.visibility as string) || 'Normal',
        optional: (n.data?.optional as boolean) || false,
        silently_complete: (n.data?.silently_complete as boolean) || false,
        can_be_repeatable: (n.data?.can_be_repeatable as boolean) || false,
        repeat_min_delay: (n.data?.repeat_min_delay as number) || 0,
        repeat_max_delay: (n.data?.repeat_max_delay as number) || 0,
        repeat_time: (n.data?.repeat_time as number) || 0,
        hide_quest_until_deps_complete: (n.data?.hide_quest_until_deps_complete as boolean) || false,
        hide_quest_until_quest_complete: (n.data?.hide_quest_until_quest_complete as boolean) || false,
        hide_quest_until_all_complete: (n.data?.hide_quest_until_all_complete as boolean) || false,
        disable_reward: (n.data?.disable_reward as boolean) || false,
        pause_reward: (n.data?.pause_reward as boolean) || false,
        lock_icon: (n.data?.lock_icon as string) || '',
        subtitle: (n.data?.subtitle as string) || '',
        quest_background: (n.data?.quest_background as string) || '',
        shape: (n.data?.shape as string) || 'Default',
        icon_scaling: (n.data?.icon_scaling as number) || 1.0,
        tags: (n.data?.tags as string[]) || [],
        progression_mode: (n.data?.progression_mode as string) || 'Default',
        sequential_tasks: (n.data?.sequential_tasks as boolean) || false,
        disable_completion_toast: (n.data?.disable_completion_toast as boolean) || false,
        ignore_reward_blocking: (n.data?.ignore_reward_blocking as boolean) || false,
        disable_jei_recipe: (n.data?.disable_jei_recipe as boolean) || false,
        min_window_width: (n.data?.min_window_width as number) || 0,
        hide_details_until_startable: (n.data?.hide_details_until_startable as boolean) || false,
        hide_text_until_completed: (n.data?.hide_text_until_completed as boolean) || false,
        invisible_until_completed: (n.data?.invisible_until_completed as boolean) || false,
        invisible_until_x_tasks: (n.data?.invisible_until_x_tasks as number) || 0,
        hide_dependency_lines: (n.data?.hide_dependency_lines as boolean) || false,
        hide_dependent_lines: (n.data?.hide_dependent_lines as boolean) || false,
        min_required_dependencies: (n.data?.min_required_dependencies as number) || 0,
        dependency_requirement: (n.data?.dependency_requirement as string) || 'AllCompleted',
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | null,
        edge_type: 'prerequisite',
        inverted: false,
      })),
    }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
    } catch (e) {
      console.error('Failed to save quest graph:', e)
    }
  }

  // ─── QuestTileComponent callbacks ─────────────────────────────────────────

  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestTileData>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onAddObjective = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, objectives: [...(n.data?.objectives as QuestObjectiveData[] || []), defaultObjective()] } }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onAddReward = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, rewards: [...(n.data?.rewards as QuestRewardData[] || []), defaultReward()] } }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                objectives: (n.data?.objectives as QuestObjectiveData[] || []).filter((o) => o.id !== objectiveId),
              },
            }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                rewards: (n.data?.rewards as QuestRewardData[] || []).filter((r) => r.id !== rewardId),
              },
            }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                objectives: (n.data?.objectives as QuestObjectiveData[] || []).map((o) =>
                  o.id === objectiveId ? { ...o, [field]: value } : o
                ),
              },
            }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                rewards: (n.data?.rewards as QuestRewardData[] || []).map((r) =>
                  r.id === rewardId ? { ...r, [field]: value } : r
                ),
              },
            }
          : n
      )
    )
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onOpenIconPicker = useCallback((target: 'quest' | 'objective' | 'reward', index?: number) => {
    ;(window as any).__iconPickerTarget = { target, nodeId: selectedNodeId, index }
    setIconPickerSearch('')
    setShowIconPicker(true)
  }, [selectedNodeId])

  // ─── toRfNodes / toRfEdges (must be after callbacks) ──────────────────────

  const toRfNodes = useCallback((graph: QuestGraphData, texIndex: Record<string, string>): Node[] => {
    const SCALE = 48
    return graph.nodes.map((n) => ({
      id: n.id,
      type: (n.node_type || 'quest').toLowerCase(),
      position: { x: n.position.x * SCALE, y: n.position.y * SCALE },
      data: {
        label: n.label,
        description: n.description,
        nodeType: n.node_type,
        objectives: n.objectives,
        rewards: n.rewards,
        required_items: n.required_items,
        chapter_id: n.chapter_id,
        icon: n.icon,
        iconDataUrl: n.icon ? (texIndex[resolveIconKey(n.icon)] || '') : '',
        size: n.size,
        color: n.color,
        visibility: n.visibility,
        optional: n.optional,
        silently_complete: n.silently_complete,
        can_be_repeatable: n.can_be_repeatable,
        repeat_min_delay: n.repeat_min_delay,
        repeat_max_delay: n.repeat_max_delay,
        repeat_time: n.repeat_time,
        hide_quest_until_deps_complete: n.hide_quest_until_deps_complete,
        hide_quest_until_quest_complete: n.hide_quest_until_quest_complete,
        hide_quest_until_all_complete: n.hide_quest_until_all_complete,
        disable_reward: n.disable_reward,
        pause_reward: n.pause_reward,
        lock_icon: n.lock_icon,
        subtitle: n.subtitle,
        quest_background: n.quest_background,
        shape: n.shape,
        icon_scaling: n.icon_scaling,
        tags: n.tags,
        progression_mode: n.progression_mode,
        sequential_tasks: n.sequential_tasks,
        disable_completion_toast: n.disable_completion_toast,
        ignore_reward_blocking: n.ignore_reward_blocking,
        disable_jei_recipe: n.disable_jei_recipe,
        min_window_width: n.min_window_width,
        hide_details_until_startable: n.hide_details_until_startable,
        hide_text_until_completed: n.hide_text_until_completed,
        invisible_until_completed: n.invisible_until_completed,
        invisible_until_x_tasks: n.invisible_until_x_tasks,
        hide_dependency_lines: n.hide_dependency_lines,
        hide_dependent_lines: n.hide_dependent_lines,
        min_required_dependencies: n.min_required_dependencies,
        dependency_requirement: n.dependency_requirement,
        // QuestTileComponent callbacks
        textureIndex: texIndex,
        onUpdateNode,
        onAddObjective,
        onAddReward,
        onRemoveObjective,
        onRemoveReward,
        onUpdateObjective,
        onUpdateReward,
        onOpenIconPicker,
      },
    }))
  }, [onUpdateNode, onAddObjective, onAddReward, onRemoveObjective, onRemoveReward, onUpdateObjective, onUpdateReward, onOpenIconPicker])

  const toRfEdges = useCallback((graph: QuestGraphData): Edge[] => {
    return graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: 'smoothstep',
      animated: e.edge_type === 'optional',
      markerEnd: { type: MarkerType.ArrowClosed },
    }))
  }, [])

  const filteredTextures = useMemo(() => {
    const entries = Object.entries(textureIndex)
    if (!iconPickerSearch) return entries
    const q = iconPickerSearch.toLowerCase()
    return entries.filter(([id]) => id.toLowerCase().includes(q))
  }, [textureIndex, iconPickerSearch])

// Re-apply textures to nodes when texture index changes (without reloading from DB)
  useEffect(() => {
    if (Object.keys(textureIndex).length === 0 || nodes.length === 0) return
    let matched = 0
    let total = 0
    const sampleIcons: string[] = []
    setNodes((nds) => nds.map((n) => {
      const icon = (n.data?.icon as string) || ''
      if (icon && n.type !== 'chapter') {
        total++
        const resolvedKey = resolveIconKey(icon)
        const url = textureIndex[resolvedKey]
        if (url) {
          matched++
          if (sampleIcons.length < 3) sampleIcons.push(`${icon} -> ${resolvedKey}`)
        } else {
          if (sampleIcons.length < 3) sampleIcons.push(`${icon} -> ${resolvedKey} (MISSING)`)
        }
      }
      const currentUrl = (n.data?.iconDataUrl as string) || ''
      const newUrl = icon ? (textureIndex[resolveIconKey(icon)] || '') : ''
      if (newUrl !== currentUrl) {
        return { ...n, data: { ...n.data, iconDataUrl: newUrl } }
      }
      return n
    }))
    console.log(`[QuestGraph] Texture reapply: ${matched}/${total} icons matched, sample=[${sampleIcons.join(', ')}]`, 'textureIndex keys:', Object.keys(textureIndex).slice(0, 5))
  }, [textureIndex, setNodes])

  // ─── Chapter filtering ─────────────────────────────────────────────────

  const filteredNodes = useMemo(() => {
    const result = nodes.filter(n => {
      if (n.type === 'chapter') return false
      if (!activeChapter) return true
      const chapterId = (n.data?.chapter_id as string) || null
      return chapterId === activeChapter
    })
    if (nodes.length > 0) {
      const chapterIds = new Set(nodes.filter(n => n.type !== 'chapter').map(n => (n.data?.chapter_id as string) || 'null'))
      console.log(`[QuestGraph] Filter: activeChapter=${activeChapter}, total=${nodes.length}, filtered=${result.length}, unique_chapter_ids=[${[...chapterIds].slice(0, 5).join(', ')}${chapterIds.size > 5 ? '...' : ''}]`)
    }
    return result
  }, [nodes, activeChapter])

  const filteredEdges = useMemo(() => {
    if (!activeChapter) return edges
    const visibleIds = new Set(filteredNodes.map(n => n.id))
    return edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
  }, [edges, filteredNodes, activeChapter])

  const chapterQuestCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      if (n.type === 'chapter') return
      const ch = (n.data?.chapter_id as string) || '_none'
      counts[ch] = (counts[ch] || 0) + 1
    })
    return counts
  }, [nodes])

  // Auto-select first chapter when graph loads
  useEffect(() => {
    if (graph && graph.chapters.length > 0 && !activeChapter) {
      setActiveChapter(graph.chapters[0].id)
    }
  }, [graph, activeChapter])

  // ─── Load / Save ───────────────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    if (importedRef.current) return
    try {
      const graph = await getQuestGraph(projectId)
      if (importedRef.current) return
      setGraph(graph)
      setNodes(toRfNodes(graph, textureIndex))
      setEdges(toRfEdges(graph))
      if (graph.chapters.length > 0) {
        setActiveChapter(graph.chapters[0].id)
      }
      // Apply auto-layout to quest nodes that are 100% at (0,0)
      setNodes(nds => {
        const questNodes = nds.filter(n => n.type !== 'chapter')
        if (questNodes.length > 0) {
          // Check if all nodes are at (0,0) - need layout
          const allAtOrigin = questNodes.every(n => n.position.x === 0 && n.position.y === 0)
          if (allAtOrigin) {
            console.log('[QuestGraph] Applying auto-layout to', questNodes.length, 'nodes')
            return autoLayoutNodes(nds, graph.chapters)
          }
        }
        return nds
      })
    } catch (e) {
      console.error('Failed to load quest graph:', e)
    }
  }, [projectId, setNodes, setEdges, toRfNodes, toRfEdges])


  const saveGraph = useCallback(async () => {
    if (!graph) return
    const SCALE = 48
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: nodes.map((n) => ({
        id: n.id,
        node_type: (n.data?.nodeType as string) || 'quest',
        label: (n.data?.label as string) || 'New Quest',
        description: (n.data?.description as string) || '',
        position: { x: n.position.x / SCALE, y: n.position.y / SCALE },
        data: {},
        objectives: (n.data?.objectives as QuestObjectiveData[]) || [],
        rewards: (n.data?.rewards as QuestRewardData[]) || [],
        required_items: (n.data?.required_items as string[]) || [],
        chapter_id: (n.data?.chapter_id as string) || null,
        icon: (n.data?.icon as string) || '',
        size: (n.data?.size as QuestSize) || { width: 24, height: 24 },
        color: (n.data?.color as string) || '',
        visibility: (n.data?.visibility as string) || 'Normal',
        optional: (n.data?.optional as boolean) || false,
        silently_complete: (n.data?.silently_complete as boolean) || false,
        can_be_repeatable: (n.data?.can_be_repeatable as boolean) || false,
        repeat_min_delay: (n.data?.repeat_min_delay as number) || 0,
        repeat_max_delay: (n.data?.repeat_max_delay as number) || 0,
        repeat_time: (n.data?.repeat_time as number) || 0,
        hide_quest_until_deps_complete: (n.data?.hide_quest_until_deps_complete as boolean) || false,
        hide_quest_until_quest_complete: (n.data?.hide_quest_until_quest_complete as boolean) || false,
        hide_quest_until_all_complete: (n.data?.hide_quest_until_all_complete as boolean) || false,
        disable_reward: (n.data?.disable_reward as boolean) || false,
        pause_reward: (n.data?.pause_reward as boolean) || false,
        lock_icon: (n.data?.lock_icon as string) || '',
        subtitle: (n.data?.subtitle as string) || '',
        quest_background: (n.data?.quest_background as string) || '',
        shape: (n.data?.shape as string) || 'Default',
        icon_scaling: (n.data?.icon_scaling as number) || 1.0,
        tags: (n.data?.tags as string[]) || [],
        progression_mode: (n.data?.progression_mode as string) || 'Default',
        sequential_tasks: (n.data?.sequential_tasks as boolean) || false,
        disable_completion_toast: (n.data?.disable_completion_toast as boolean) || false,
        ignore_reward_blocking: (n.data?.ignore_reward_blocking as boolean) || false,
        disable_jei_recipe: (n.data?.disable_jei_recipe as boolean) || false,
        min_window_width: (n.data?.min_window_width as number) || 0,
        hide_details_until_startable: (n.data?.hide_details_until_startable as boolean) || false,
        hide_text_until_completed: (n.data?.hide_text_until_completed as boolean) || false,
        invisible_until_completed: (n.data?.invisible_until_completed as boolean) || false,
        invisible_until_x_tasks: (n.data?.invisible_until_x_tasks as number) || 0,
        hide_dependency_lines: (n.data?.hide_dependency_lines as boolean) || false,
        hide_dependent_lines: (n.data?.hide_dependent_lines as boolean) || false,
        min_required_dependencies: (n.data?.min_required_dependencies as number) || 0,
        dependency_requirement: (n.data?.dependency_requirement as string) || 'AllCompleted',
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | null,
        edge_type: 'prerequisite',
        inverted: false,
      })),
    }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
    } catch (e) {
      console.error('Failed to save quest graph:', e)
    }
  }, [graph, nodes, edges, projectId])

  // ─── Node types for QuestTileComponent ───────────────────────────────────

  const nodeTypes = useMemo(() => ({
    chapter: QuestTileComponent,
    quest: QuestTileComponent,
    reward: QuestTileComponent,
    gate: QuestTileComponent,
    side_quest: QuestTileComponent,
  }), [QuestTileComponent])

  const loadAnalysis = useCallback(async () => {
    try {
      const analysis = await analyzeQuestGraph(projectId)
      setAnalysis(analysis)
      setShowAnalysis(true)
    } catch (e) {
      console.error('Failed to load analysis:', e)
    }
  }, [projectId])

  // ─── Import / Export ────────────────────────────────────────────────────

  const autoGenerate = useCallback(async () => {
    let packDir = projectPath
    if (!packDir) {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select FTB Quests pack directory',
        defaultPath: modsDir || undefined,
      })
      if (!selected) return
      packDir = selected as string
    }
    try {
      const result = await importFtbQuestsFromDir(packDir)
      if (result.graph) {
        importedRef.current = true
        const chIds = result.graph.chapters.map(c => c.id)
        const questChIds = new Set(result.graph.nodes.filter(n => n.node_type !== 'Chapter').map(n => n.chapter_id || 'null'))
        console.log(`[QuestGraph] Import: ${result.chapter_count} chapters, ${result.quest_count} quests, format=${result.format}, layout=${result.layout}`)
        console.log(`[QuestGraph] Chapter IDs: [${chIds.slice(0, 3).join(', ')}${chIds.length > 3 ? '...' : ''}]`)
        console.log(`[QuestGraph] Quest chapter_ids: [${[...questChIds].slice(0, 5).join(', ')}${questChIds.size > 5 ? '...' : ''}]`)
        console.log(`[QuestGraph] First chapter: id=${chIds[0]}, title=${result.graph.chapters[0]?.title}`)
        setGraph(result.graph)
        setNodes(toRfNodes(result.graph, textureIndex))
        setEdges(toRfEdges(result.graph))
        setActiveChapter(result.graph.chapters[0]?.id ?? null)
        setSelectedNodeId(null)
        // Apply auto-layout after import
        setNodes(nds => autoLayoutNodes(nds, result.graph.chapters))
        try {
          await saveQuestGraph(projectId, result.graph)
        } catch (e) {
          console.error('Failed to save imported graph:', e)
        }
        const modsPath = packDir ? `${packDir}/mods` : ''
        if (modsPath && Object.keys(textureIndex).length === 0) {
          try {
            const idx = await scanModJarTextures(modsPath)
            setTextureIndex(idx)
            const texCount = Object.keys(idx).length
            if (texCount > 0) {
              setModsDirPersisted(modsPath)
              setNodes(toRfNodes(result.graph, idx))
              setNodes(nds => autoLayoutNodes(nds, result.graph.chapters))
              alert(`Loaded ${result.quest_count} quests, ${result.chapter_count} chapters, and ${texCount} textures`)
              return
            }
          } catch (_) {}
        }
        alert(`Loaded ${result.quest_count} quests in ${result.chapter_count} chapters (${result.format})`)
      }
    } catch (e) {
      console.error('Failed to import FTB Quests:', e)
      alert(`Failed to load FTB Quests: ${e}`)
    }
  }, [projectId, projectPath, setNodes, setEdges, toRfNodes, toRfEdges, textureIndex, modsDir, setModsDirPersisted, autoLayoutNodes])

  const exportFtbQuests = useCallback(async () => {
    if (!graph) return
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select export directory for FTB Quests',
      })
      if (!selected) return
      await exportFtbQuestsToDir(projectId, selected as string)
      console.log(`[ModCanvas] Exported FTB Quests to ${selected}`)
    } catch (e) {
      console.error('Failed to export FTB Quests:', e)
    }
  }, [projectId, graph])

  // ─── Connections ───────────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
      )
      setTimeout(saveGraph, 100)
    },
    [setEdges, saveGraph]
  )

  // ─── Node selection / deselection ─────────────────────────────────────

  const selectNode = useCallback((node: Node) => {
    setSelectedNodeId(node.id)
    setEditLabel((node.data?.label as string) || '')
    setEditDesc((node.data?.description as string) || '')
    setEditSubtitle((node.data?.subtitle as string) || '')
    setEditColor((node.data?.color as string) || '')
    setEditVisibility((node.data?.visibility as string) || 'Normal')
    setEditOptional((node.data?.optional as boolean) || false)
    setEditRepeatable((node.data?.can_be_repeatable as boolean) || false)
    setEditSilentComplete((node.data?.silently_complete as boolean) || false)
    setEditRepeatTime((node.data?.repeat_time as number) || 0)
    setEditRepeatMinDelay((node.data?.repeat_min_delay as number) || 0)
    setEditRepeatMaxDelay((node.data?.repeat_max_delay as number) || 0)
    setEditIcon((node.data?.icon as string) || '')
    setEditHideDeps((node.data?.hide_quest_until_deps_complete as boolean) || false)
    setEditHideQuest((node.data?.hide_quest_until_quest_complete as boolean) || false)
    setEditHideAll((node.data?.hide_quest_until_all_complete as boolean) || false)
    setEditDisableReward((node.data?.disable_reward as boolean) || false)
    setEditPauseReward((node.data?.pause_reward as boolean) || false)
    setEditShape((node.data?.shape as string) || 'Default')
    setEditIconScaling((node.data?.icon_scaling as number) || 1.0)
    setEditTags(((node.data?.tags as string[]) || []).join(', '))
    setEditProgressionMode((node.data?.progression_mode as string) || 'Default')
    setEditSequentialTasks((node.data?.sequential_tasks as boolean) || false)
    setEditDisableToast((node.data?.disable_completion_toast as boolean) || false)
    setEditIgnoreRewardBlocking((node.data?.ignore_reward_blocking as boolean) || false)
    setEditDisableJei((node.data?.disable_jei_recipe as boolean) || false)
    setEditHideDetailsUntilStartable((node.data?.hide_details_until_startable as boolean) || false)
    setEditHideTextUntilCompleted((node.data?.hide_text_until_completed as boolean) || false)
    setEditInvisibleUntilCompleted((node.data?.invisible_until_completed as boolean) || false)
    setEditInvisibleUntilXTasks((node.data?.invisible_until_x_tasks as number) || 0)
    setEditHideDepLines((node.data?.hide_dependency_lines as boolean) || false)
    setEditHideDeptLines((node.data?.hide_dependent_lines as boolean) || false)
    setEditMinReqDeps((node.data?.min_required_dependencies as number) || 0)
    setEditDepRequirement((node.data?.dependency_requirement as string) || 'AllCompleted')
    setInspectorTab('general')
  }, [])

  const deselectNode = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node)
  }, [selectNode])

  const onPaneClick = useCallback(() => { deselectNode() }, [deselectNode])

    // ─── Live save (inspector panel edits apply immediately) ────────────────

  const liveSaveField = useCallback((field: string, value: unknown) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, [field]: value } }
          : n
      )
    )
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  const liveSaveObjectives = useCallback((objectives: QuestObjectiveData[]) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, objectives } } : n)
    )
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  const liveSaveRewards = useCallback((rewards: QuestRewardData[]) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, rewards } } : n)
    )
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  // ─── Chapter management ────────────────────────────────────────────────

  const addChapter = useCallback(async () => {
    if (!graph) return
    const newChapter: QuestChapter = {
      id: crypto.randomUUID(),
      title: `Chapter ${graph.chapters.length + 1}`,
      description: '',
      icon: '📖',
      background_image: '',
      order_index: graph.chapters.length,
      hide_until_first_quest_complete: false,
      default_quest_size: { width: 24, height: 24 },
      quest_color: '',
      group_id: null,
      default_quest_shape: 'Default',
      default_enabled: true,
      progression_mode: 'Default',
    }
    const updatedGraph: QuestGraphData = { ...graph, chapters: [...graph.chapters, newChapter] }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
      setActiveChapter(newChapter.id)
    } catch (e) {
      console.error('Failed to add chapter:', e)
    }
  }, [graph, projectId])

  // ─── Popup Objective helpers ───────────────────────────────────────────

  const inspectorObjectives = useMemo(() => {
    const sel = nodes.find(n => n.id === selectedNodeId)
    return (sel?.data?.objectives as QuestObjectiveData[]) || []
  }, [selectedNodeId, nodes])

  const inspectorRewards = useMemo(() => {
    const sel = nodes.find(n => n.id === selectedNodeId)
    return (sel?.data?.rewards as QuestRewardData[]) || []
  }, [selectedNodeId, nodes])

  const updateInspectorObjective = useCallback((objIndex: number, field: keyof QuestObjectiveData, value: string | number | boolean) => {
    if (!selectedNodeId) return
    const objectives = [...inspectorObjectives]
    objectives[objIndex] = { ...objectives[objIndex], [field]: value }
    liveSaveObjectives(objectives)
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const addInspectorObjective = useCallback(() => {
    if (!selectedNodeId) return
    const objectives = [...inspectorObjectives, defaultObjective()]
    liveSaveObjectives(objectives)
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const removeInspectorObjective = useCallback((objIndex: number) => {
    if (!selectedNodeId) return
    const objectives = inspectorObjectives.filter((_, i) => i !== objIndex)
    liveSaveObjectives(objectives)
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const updateInspectorReward = useCallback((rewIndex: number, field: keyof QuestRewardData, value: string | number | boolean | string[]) => {
    if (!selectedNodeId) return
    const rewards = [...inspectorRewards]
    rewards[rewIndex] = { ...rewards[rewIndex], [field]: value }
    liveSaveRewards(rewards)
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  const addInspectorReward = useCallback(() => {
    if (!selectedNodeId) return
    const rewards = [...inspectorRewards, defaultReward()]
    liveSaveRewards(rewards)
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  const removeInspectorReward = useCallback((rewIndex: number) => {
    if (!selectedNodeId) return
    const rewards = inspectorRewards.filter((_, i) => i !== rewIndex)
    liveSaveRewards(rewards)
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  // ─── Book settings ─────────────────────────────────────────────────────

  const openBookSettings = useCallback(() => {
    if (!graph) return
    setEditBookProgressionMode(graph.book_progression_mode || 'Default')
    setEditBookIcon(graph.book_icon || '')
    setEditBookBgImage(graph.book_background_image || '')
    setEditQuestColor(graph.quest_color || '')
    setEditDefaultQuestWidth(graph.default_quest_size?.width || 24)
    setEditDefaultQuestHeight(graph.default_quest_size?.height || 24)
    setEditDefaultQuestShape(graph.default_quest_shape || 'Default')
    setShowBookSettings(true)
  }, [graph])

  const saveBookSettings = useCallback(async () => {
    if (!graph) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      book_progression_mode: editBookProgressionMode,
      book_icon: editBookIcon,
      book_background_image: editBookBgImage,
      quest_color: editQuestColor,
      default_quest_size: { width: editDefaultQuestWidth, height: editDefaultQuestHeight },
      default_quest_shape: editDefaultQuestShape,
    }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
      setShowBookSettings(false)
    } catch (e) {
      console.error('Failed to save book settings:', e)
    }
  }, [graph, editBookProgressionMode, editBookIcon, editBookBgImage, editQuestColor, editDefaultQuestWidth, editDefaultQuestHeight, editDefaultQuestShape, projectId])

  const saveGroups = useCallback(async () => {
    if (!graph) return
    const updatedGraph: QuestGraphData = { ...graph, chapter_groups: editGroups }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
      setShowGroups(false)
    } catch (e) {
      console.error('Failed to save groups:', e)
    }
  }, [graph, editGroups, projectId])

  // ─── Objective type helpers ────────────────────────────────────────────

  const isItemObjective = (ot: string) => ['item_acquisition', 'item_retrieval', 'item_crafting'].includes(ot)
  const isFluidObjective = (ot: string) => ot === 'fluid'
  const isEnergyObjective = (ot: string) => ot === 'energy'
  const isXpObjective = (ot: string) => ot === 'xp'
  const isEntityObjective = (ot: string) => ot === 'entity_kill'
  const isLocationObjective = (ot: string) => ot === 'location_visit'
  const isCommandObjective = (ot: string) => ot === 'command'
  const isAdvancementObjective = (ot: string) => ot === 'advancement'
  const isStatObjective = (ot: string) => ot === 'stat'
  const isObservationObjective = (ot: string) => ot === 'observation'
  const isBiomeObjective = (ot: string) => ot === 'visit_biome'
  const isStructureObjective = (ot: string) => ot === 'find_structure'
  const isItemReward = (rt: string) => ['item', 'item_weighted'].includes(rt)
  const isTableReward = (rt: string) => ['all_table', 'random', 'loot_table'].includes(rt)

  // ─── Init ──────────────────────────────────────────────────────────────

  useEffect(() => { loadGraph() }, [loadGraph])

  // Apply auto-layout when active chapter changes or nodes are added
  useEffect(() => {
    if (graph && nodes.length > 0) {
      // Check if any quest nodes are at origin (0,0) and need layout
      const questNodes = nodes.filter(n => n.type !== 'chapter')
      const allAtOrigin = questNodes.length > 0 && questNodes.every(n => n.position.x === 0 && n.position.y === 0)
      
      if (allAtOrigin) {
        console.log('[QuestGraph] Applying auto-layout to', questNodes.length, 'nodes')
        setNodes(nds => autoLayoutNodes(nds, graph.chapters))
      }
    }
  }, [activeChapter, nodes.length, graph?.chapters, setNodes, autoLayoutNodes])

  // ─── Inspector derived ───────────────────────────────────────────────

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return nodes.find(n => n.id === selectedNodeId) || null
  }, [selectedNodeId, nodes])

  const selectedNodeType = selectedNode ? ((selectedNode.data?.nodeType as string) || 'quest') : 'quest'
  const selectedLabel = selectedNode ? ((selectedNode.data?.label as string) || 'Node') : ''
  const selectedIconDataUrl = selectedNode ? ((selectedNode.data?.iconDataUrl as string) || '') : ''
  const isQuestSelected = selectedNodeType === 'quest' || selectedNodeType === 'side_quest'
  const selectedFallbackIcon = selectedNodeType === 'chapter' ? '📖' : selectedNodeType === 'gate' ? '🔒' : selectedNodeType === 'reward' ? '🎁' : selectedNodeType === 'side_quest' ? '📋' : '📜'

  // ─── Context menu handlers ────────────────────────────────────────────

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    selectNode(node)
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
  }, [selectNode])

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const createQuestAtCursor = useCallback((type: string = 'quest') => {
    if (!graph || !activeChapter) return
    const newNode: QuestNodeData = {
      id: generateFtbHexId(),
      node_type: type,
      label: type === 'reward' ? 'New Reward' : type === 'gate' ? 'New Gate' : type === 'side_quest' ? 'Side Quest' : 'New Quest',
      description: '',
      position: { x: 0, y: 0 },
      data: {},
      objectives: [],
      rewards: [],
      required_items: [],
      chapter_id: activeChapter,
      icon: '',
      size: { width: 24, height: 24 },
      color: '',
      visibility: 'Normal',
      optional: false,
      silently_complete: false,
      can_be_repeatable: false,
      repeat_min_delay: 0,
      repeat_max_delay: 0,
      repeat_time: 0,
      hide_quest_until_deps_complete: false,
      hide_quest_until_quest_complete: false,
      hide_quest_until_all_complete: false,
      disable_reward: false,
      pause_reward: false,
      lock_icon: '',
      subtitle: '',
      quest_background: '',
      shape: 'Default',
      icon_scaling: 1.0,
      tags: [],
      progression_mode: 'Default',
      sequential_tasks: false,
      disable_completion_toast: false,
      ignore_reward_blocking: false,
      disable_jei_recipe: false,
      min_window_width: 0,
      hide_details_until_startable: false,
      hide_text_until_completed: false,
      invisible_until_completed: false,
      invisible_until_x_tasks: 0,
      hide_dependency_lines: false,
      hide_dependent_lines: false,
      min_required_dependencies: 0,
      dependency_requirement: 'AllCompleted',
    }
    const updatedGraph: QuestGraphData = { ...graph, nodes: [...graph.nodes, newNode] }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodes(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
    }).catch((e) => console.error('Failed to create quest:', e))
    closeContextMenu()
  }, [graph, activeChapter, projectId, setNodes, setEdges, toRfNodes, toRfEdges, textureIndex, closeContextMenu])

  const deleteSelectedNode = useCallback(() => {
    if (!graph || !selectedNodeId) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: graph.nodes.filter(n => n.id !== selectedNodeId),
      edges: graph.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId),
    }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodes(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
      deselectNode()
    }).catch((e) => console.error('Failed to delete quest:', e))
    closeContextMenu()
  }, [graph, selectedNodeId, projectId, setNodes, setEdges, toRfNodes, toRfEdges, textureIndex, deselectNode, closeContextMenu])

  const deleteNodeById = useCallback((nodeId: string) => {
    if (!graph) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: graph.nodes.filter(n => n.id !== nodeId),
      edges: graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodes(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
      deselectNode()
    }).catch((e) => console.error('Failed to delete quest:', e))
    closeContextMenu()
  }, [graph, projectId, setNodes, setEdges, toRfNodes, toRfEdges, textureIndex, deselectNode, closeContextMenu])

  const pasteNode = useCallback(() => {
    if (!clipboard || !graph || !activeChapter) return
    const newNode: QuestNodeData = {
      id: generateFtbHexId(),
      node_type: (clipboard.data?.nodeType as string) || 'quest',
      label: `${(clipboard.data?.label as string) || 'Quest'} (copy)`,
      description: (clipboard.data?.description as string) || '',
      position: { x: clipboard.position.x + 2, y: clipboard.position.y + 2 },
      data: {},
      objectives: ((clipboard.data?.objectives as QuestObjectiveData[]) || []).map(o => ({ ...o, id: crypto.randomUUID() })),
      rewards: ((clipboard.data?.rewards as QuestRewardData[]) || []).map(r => ({ ...r, id: crypto.randomUUID() })),
      required_items: ((clipboard.data?.required_items as string[]) || []),
      chapter_id: activeChapter,
      icon: (clipboard.data?.icon as string) || '',
      size: (clipboard.data?.size as QuestSize) || { width: 24, height: 24 },
      color: (clipboard.data?.color as string) || '',
      visibility: (clipboard.data?.visibility as string) || 'Normal',
      optional: (clipboard.data?.optional as boolean) || false,
      silently_complete: (clipboard.data?.silently_complete as boolean) || false,
      can_be_repeatable: (clipboard.data?.can_be_repeatable as boolean) || false,
      repeat_min_delay: 0, repeat_max_delay: 0, repeat_time: 0,
      hide_quest_until_deps_complete: false, hide_quest_until_quest_complete: false, hide_quest_until_all_complete: false,
      disable_reward: false, pause_reward: false, lock_icon: '',
      subtitle: (clipboard.data?.subtitle as string) || '',
      quest_background: (clipboard.data?.quest_background as string) || '',
      shape: (clipboard.data?.shape as string) || 'Default',
      icon_scaling: (clipboard.data?.icon_scaling as number) || 1.0,
      tags: ((clipboard.data?.tags as string[]) || []),
      progression_mode: 'Default', sequential_tasks: false,
      disable_completion_toast: false, ignore_reward_blocking: false, disable_jei_recipe: false,
      min_window_width: 0, hide_details_until_startable: false, hide_text_until_completed: false,
      invisible_until_completed: false, invisible_until_x_tasks: 0,
      hide_dependency_lines: false, hide_dependent_lines: false,
      min_required_dependencies: 0, dependency_requirement: 'AllCompleted',
    }
    const updatedGraph: QuestGraphData = { ...graph, nodes: [...graph.nodes, newNode] }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodes(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
    }).catch((e) => console.error('Failed to paste quest:', e))
    closeContextMenu()
  }, [clipboard, graph, activeChapter, projectId, setNodes, setEdges, toRfNodes, toRfEdges, textureIndex, closeContextMenu])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      if (e.key === 'Escape') {
        deselectNode()
        closeContextMenu()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault()
          deleteSelectedNode()
        }
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (selectedNode) {
          e.preventDefault()
          setClipboard(selectedNode)
        }
      } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        pasteNode()
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        // Select all in chapter - could be expanded
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeId, selectedNode, deselectNode, closeContextMenu, deleteSelectedNode, pasteNode])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="quest-editor">
      <div className="quest-editor-toolbar">
        <div className="toolbar-section">
          <h3>Quest Designer</h3>
        </div>
        <div className="toolbar-actions">
          <button className="btn-success" onClick={autoGenerate}>Load from Pack</button>
          <button className="btn-success" onClick={exportFtbQuests}>Export as FTB Quests</button>
          <button className="btn-primary" onClick={() => createQuestAtCursor('quest')}>+ Add Quest</button>
          <button className="btn-secondary" onClick={saveGraph}>Save</button>
          <button className="btn-secondary" onClick={loadAnalysis}>Analyze</button>
          <button className="btn-secondary" onClick={browseModsDir}>Mods Dir</button>
          {modsDir && <span className="toolbar-info" title={modsDir}>{Object.keys(textureIndex).length} icons</span>}
          <button className="btn-secondary" onClick={() => { setEditGroups(graph?.chapter_groups ? [...graph.chapter_groups] : []); setShowGroups(true) }}>Groups</button>
          <button className="btn-secondary" onClick={openBookSettings}>Book Settings</button>
        </div>
      </div>

      <div className="quest-editor-layout">
        {/* ─── Chapter Sidebar ─── */}
        <div className="ftb-chapter-sidebar">
          <div className="ftb-chapters-header">
            Chapters
            <span className="chapter-count">{graph?.chapters.length || 0}</span>
          </div>
          <div className="ftb-chapter-list">
            {(() => {
              if (!graph || graph.chapters.length === 0) {
                return (
                  <div style={{ padding: '16px 12px', fontSize: 12, color: '#6c7086', textAlign: 'center' }}>
                    No chapters yet
                  </div>
                )
              }
              const groups = graph.chapter_groups || []
              const chaptersByGroup: Record<string, typeof graph.chapters> = {}
              const ungrouped: typeof graph.chapters = []
              for (const ch of graph.chapters) {
                if (ch.group_id) {
                  if (!chaptersByGroup[ch.group_id]) chaptersByGroup[ch.group_id] = []
                  chaptersByGroup[ch.group_id].push(ch)
                } else {
                  ungrouped.push(ch)
                }
              }
              const items: React.ReactNode[] = []
              // Debug: log chapter icons
              if (graph && graph.chapters.length > 0) {
                console.log('[QuestGraph] Chapter icons:', graph.chapters.map(ch => ({ title: ch.title, icon: ch.icon, resolved: resolveIconKey(ch.icon), hasTexture: !!textureIndex[resolveIconKey(ch.icon)] })))
              }
              const renderChapter = (ch: typeof graph.chapters[0]) => {
                const resolvedIcon = resolveIconKey(ch.icon)
                const iconUrl = ch.icon ? textureIndex[resolvedIcon] : ''
                console.log(`[QuestGraph] Chapter "${ch.title}": icon="${ch.icon}" resolved="${resolvedIcon}" url="${iconUrl ? 'FOUND' : 'MISSING'}"`)
                return (
                  <button
                    key={ch.id}
                    className={`ftb-chapter-tab ${activeChapter === ch.id ? 'active' : ''}`}
                    onClick={() => setActiveChapter(ch.id)}
                  >
                    <span className="ch-icon">
                      {iconUrl ? (
                        <img src={iconUrl} alt="" style={{ width: 18, height: 18, imageRendering: 'pixelated' }} />
                      ) : (
                        ch.icon || '📖'
                      )}
                    </span>
                    <span className="ch-title">{ch.title}</span>
                    <span className="ch-count">{chapterQuestCounts[ch.id] || 0}</span>
                  </button>
                )
              }
              for (const ch of ungrouped) {
                items.push(renderChapter(ch))
              }
              for (const group of groups.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))) {
                const groupChapters = chaptersByGroup[group.id] || []
                if (groupChapters.length === 0) continue
                const isCollapsed = !!collapsedGroups[group.id]
                // Use group index for readable fallback name
                const groupTitle = group.title || `Group ${groups.indexOf(group) + 1}`
                items.push(
                  <div key={`group-${group.id}`} className="ftb-chapter-group">
                    <button
                      className="ftb-chapter-group-header"
                      onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                    >
                      <span className="group-chevron">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="group-title">{groupTitle}</span>
                      <span className="group-count">{groupChapters.length}</span>
                    </button>
                    {!isCollapsed && groupChapters.map(renderChapter)}
                  </div>
                )
              }
              return items
            })()}
          </div>
          <button className="ftb-add-chapter" onClick={addChapter}>+ Add Chapter</button>
        </div>

        {/* ─── Canvas ─── */}
        <div className="quest-editor-canvas">
          <ReactFlow
            nodes={filteredNodes}
            edges={filteredEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            onMove={(_, vp) => setViewportPos(vp)}
            onEdgeDoubleClick={(_, edge) => {
              if (confirm('Delete this connection?')) {
                setEdges((eds) => eds.filter((e) => e.id !== edge.id))
                setTimeout(saveGraph, 100)
              }
            }}
          >
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const type = (node.data?.nodeType as string) || 'quest'
                const colors: Record<string, string> = {
                  chapter: '#10b981', quest: '#3b82f6', reward: '#f59e0b',
                  gate: '#ef4444', side_quest: '#8b5cf6',
                }
                return colors[type] || '#6b7280'
              }}
              maskColor="rgba(0,0,0,0.7)"
            />
            <Background color="#1e2533" gap={24} size={1} />
          </ReactFlow>
        </div>
      </div>

      {/* ─── Quest Popup Overlay ─── */}
            {/* ─── Inspector Panel (right side) ─── */}
      <div className="quest-editor-inspector">
        {selectedNode && (
          <>
            {/* Header */}
            <div className="inspector-panel-header">
              <div className="inspector-panel-header-left">
                <div className="inspector-panel-icon">
                  {selectedIconDataUrl ? (
                    <img src={selectedIconDataUrl} alt="" style={{ width: 24, height: 24, imageRendering: 'pixelated' }} />
                  ) : (
                    <span style={{ fontSize: 16 }}>{selectedFallbackIcon}</span>
                  )}
                </div>
                <div>
                  <div className="inspector-panel-title">{selectedLabel}</div>
                  <div className="inspector-panel-subtitle">{selectedNodeType.replace('_', ' ')}</div>
                </div>
              </div>
              <button className="inspector-panel-close" onClick={deselectNode}>×</button>
            </div>

            {/* Tabs */}
            <div className="inspector-panel-tabs">
              <button className={`inspector-panel-tab ${inspectorTab === 'general' ? 'active' : ''}`} onClick={() => setInspectorTab('general')}>General</button>
              {isQuestSelected && <button className={`inspector-panel-tab ${inspectorTab === 'objectives' ? 'active' : ''}`} onClick={() => setInspectorTab('objectives')}>Objectives</button>}
              {isQuestSelected && <button className={`inspector-panel-tab ${inspectorTab === 'rewards' ? 'active' : ''}`} onClick={() => setInspectorTab('rewards')}>Rewards</button>}
              <button className={`inspector-panel-tab ${inspectorTab === 'advanced' ? 'active' : ''}`} onClick={() => setInspectorTab('advanced')}>Advanced</button>
            </div>

            {/* Body */}
            <div className="inspector-panel-body">
              {/* ─── General Tab ─── */}
              {inspectorTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspector-panel-field">
                    <label>Label</label>
                    <input type="text" value={editLabel} onChange={(e) => { setEditLabel(e.target.value); liveSaveField('label', e.target.value) }} />
                  </div>
                  <div className="inspector-panel-field">
                    <label>Description</label>
                    <textarea value={editDesc} onChange={(e) => { setEditDesc(e.target.value); liveSaveField('description', e.target.value) }} rows={3} />
                  </div>
                  <div className="inspector-panel-field">
                    <label>Subtitle</label>
                    <input type="text" value={editSubtitle} onChange={(e) => { setEditSubtitle(e.target.value); liveSaveField('subtitle', e.target.value) }} />
                  </div>
                  <div className="inspector-panel-row">
                    <div className="inspector-panel-field">
                      <label>Color</label>
                      <input type="color" value={editColor || '#3b82f6'} onChange={(e) => { setEditColor(e.target.value); liveSaveField('color', e.target.value) }} style={{ height: 34, padding: '2px 4px' }} />
                    </div>
                    <div className="inspector-panel-field">
                      <label>Icon (item id)</label>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="text" value={editIcon} onChange={(e) => { setEditIcon(e.target.value); liveSaveField('icon', e.target.value) }} placeholder="minecraft:diamond" style={{ flex: 1 }} />
                        <button className="ftb-popup-btn" onClick={openIconPicker} style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11 }}>Browse</button>
                      </div>
                      {editIcon && textureIndex[editIcon] && (
                        <div style={{ marginTop: 4 }}>
                          <img src={textureIndex[editIcon]} alt={editIcon} style={{ width: 32, height: 32, imageRendering: 'pixelated', borderRadius: 4, background: '#11111b', padding: 2 }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="inspector-panel-field">
                    <label>Visibility</label>
                    <select value={editVisibility} onChange={(e) => { setEditVisibility(e.target.value); liveSaveField('visibility', e.target.value) }}>
                      {VISIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="inspector-panel-checkbox">
                    <input type="checkbox" checked={editOptional} onChange={(e) => { setEditOptional(e.target.checked); liveSaveField('optional', e.target.checked) }} />
                    Optional
                  </label>
                </div>
              )}

              {/* ─── Objectives Tab ─── */}
              {inspectorTab === 'objectives' && isQuestSelected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspector-panel-section-title">Objectives ({inspectorObjectives.length})</div>
                  {inspectorObjectives.map((obj, idx) => (
                    <div key={obj.id} className="inspector-panel-card">
                      <div className="inspector-panel-card-header">
                        <span className="inspector-panel-card-index">#{idx + 1}</span>
                        <button className="inspector-panel-card-remove" onClick={() => removeInspectorObjective(idx)}>×</button>
                      </div>
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Label</label>
                        <input type="text" value={obj.label} onChange={(e) => updateInspectorObjective(idx, 'label', e.target.value)} />
                      </div>
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Type</label>
                        <select value={obj.objective_type} onChange={(e) => updateInspectorObjective(idx, 'objective_type', e.target.value)}>
                          {OBJECTIVE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {isItemObjective(obj.objective_type) && (
                        <>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Target (item id / tag)</label>
                            <input type="text" value={obj.target} onChange={(e) => updateInspectorObjective(idx, 'target', e.target.value)} placeholder="minecraft:diamond" />
                          </div>
                          <div className="inspector-panel-row">
                            <div className="inspector-panel-field">
                              <label>Count</label>
                              <input type="number" value={obj.target_count} onChange={(e) => updateInspectorObjective(idx, 'target_count', Number(e.target.value))} />
                            </div>
                            <div className="inspector-panel-field">
                              <label className="inspector-panel-checkbox" style={{ marginTop: 20 }}>
                                <input type="checkbox" checked={obj.consume_items} onChange={(e) => updateInspectorObjective(idx, 'consume_items', e.target.checked)} />
                                Consume
                              </label>
                            </div>
                          </div>
                        </>
                      )}
                      {isFluidObjective(obj.objective_type) && (
                        <div className="inspector-panel-row">
                          <div className="inspector-panel-field"><label>Fluid ID</label><input type="text" value={obj.fluid_id} onChange={(e) => updateInspectorObjective(idx, 'fluid_id', e.target.value)} /></div>
                          <div className="inspector-panel-field"><label>Amount</label><input type="number" value={obj.fluid_amount} onChange={(e) => updateInspectorObjective(idx, 'fluid_amount', Number(e.target.value))} /></div>
                        </div>
                      )}
                      {isEnergyObjective(obj.objective_type) && (
                        <div className="inspector-panel-row">
                          <div className="inspector-panel-field"><label>Energy</label><input type="number" value={obj.energy_amount} onChange={(e) => updateInspectorObjective(idx, 'energy_amount', Number(e.target.value))} /></div>
                          <div className="inspector-panel-field"><label>Unit</label><input type="text" value={obj.energy_unit} onChange={(e) => updateInspectorObjective(idx, 'energy_unit', e.target.value)} /></div>
                        </div>
                      )}
                      {isXpObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>XP Levels</label>
                          <input type="number" value={obj.xp_levels} onChange={(e) => updateInspectorObjective(idx, 'xp_levels', Number(e.target.value))} />
                        </div>
                      )}
                      {isEntityObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Entity ID</label>
                          <input type="text" value={obj.entity_id} onChange={(e) => updateInspectorObjective(idx, 'entity_id', e.target.value)} placeholder="minecraft:zombie" />
                        </div>
                      )}
                      {isLocationObjective(obj.objective_type) && (
                        <div className="inspector-panel-row">
                          <div className="inspector-panel-field"><label>X</label><input type="number" value={obj.x} onChange={(e) => updateInspectorObjective(idx, 'x', Number(e.target.value))} /></div>
                          <div className="inspector-panel-field"><label>Y</label><input type="number" value={obj.y} onChange={(e) => updateInspectorObjective(idx, 'y', Number(e.target.value))} /></div>
                          <div className="inspector-panel-field"><label>Z</label><input type="number" value={obj.z} onChange={(e) => updateInspectorObjective(idx, 'z', Number(e.target.value))} /></div>
                        </div>
                      )}
                      {isCommandObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Command</label>
                          <input type="text" value={obj.command} onChange={(e) => updateInspectorObjective(idx, 'command', e.target.value)} placeholder="/say hello" />
                        </div>
                      )}
                      {isAdvancementObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Advancement ID</label>
                          <input type="text" value={obj.advancement_id} onChange={(e) => updateInspectorObjective(idx, 'advancement_id', e.target.value)} placeholder="minecraft:adventure/root" />
                        </div>
                      )}
                      {isStatObjective(obj.objective_type) && (
                        <>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Statistic Name</label>
                            <input type="text" value={obj.stat_name} onChange={(e) => updateInspectorObjective(idx, 'stat_name', e.target.value)} placeholder="minecraft:custom minecraft:distance_flown" />
                          </div>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Required Value</label>
                            <input type="number" value={obj.stat_value} onChange={(e) => updateInspectorObjective(idx, 'stat_value', Number(e.target.value))} />
                          </div>
                        </>
                      )}
                      {isObservationObjective(obj.objective_type) && (
                        <>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Block/Entity to Observe</label>
                            <input type="text" value={obj.target} onChange={(e) => updateInspectorObjective(idx, 'target', e.target.value)} placeholder="minecraft:enchanting_table" />
                          </div>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Range (blocks)</label>
                            <input type="number" step="0.5" value={obj.observation_range} onChange={(e) => updateInspectorObjective(idx, 'observation_range', Number(e.target.value))} />
                          </div>
                        </>
                      )}
                      {isBiomeObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Biome ID</label>
                          <input type="text" value={obj.biome_id} onChange={(e) => updateInspectorObjective(idx, 'biome_id', e.target.value)} placeholder="minecraft:plains" />
                        </div>
                      )}
                      {isStructureObjective(obj.objective_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Structure ID</label>
                          <input type="text" value={obj.structure_id} onChange={(e) => updateInspectorObjective(idx, 'structure_id', e.target.value)} placeholder="minecraft:village/plains" />
                        </div>
                      )}
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Description</label>
                        <input type="text" value={obj.description} onChange={(e) => updateInspectorObjective(idx, 'description', e.target.value)} />
                      </div>
                      <label className="inspector-panel-checkbox">
                        <input type="checkbox" checked={obj.required} onChange={(e) => updateInspectorObjective(idx, 'required', e.target.checked)} />
                        Required
                      </label>
                    </div>
                  ))}
                  <button className="inspector-panel-add-btn" onClick={addInspectorObjective}>+ Add Objective</button>
                </div>
              )}

              {/* ─── Rewards Tab ─── */}
              {inspectorTab === 'rewards' && isQuestSelected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspector-panel-section-title">Rewards ({inspectorRewards.length})</div>
                  {inspectorRewards.map((rew, idx) => (
                    <div key={rew.id} className="inspector-panel-card">
                      <div className="inspector-panel-card-header">
                        <span className="inspector-panel-card-index">#{idx + 1}</span>
                        <button className="inspector-panel-card-remove" onClick={() => removeInspectorReward(idx)}>×</button>
                      </div>
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Label</label>
                        <input type="text" value={rew.label} onChange={(e) => updateInspectorReward(idx, 'label', e.target.value)} />
                      </div>
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Type</label>
                        <select value={rew.reward_type} onChange={(e) => updateInspectorReward(idx, 'reward_type', e.target.value)}>
                          {REWARD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {isItemReward(rew.reward_type) && (
                        <>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>Item ID / Tag</label>
                            <input type="text" value={rew.item_id || (rew.items[0] || '')}
                              onChange={(e) => {
                                const v = e.target.value
                                updateInspectorReward(idx, 'item_id', v)
                                updateInspectorReward(idx, 'items', v ? [v] : [])
                              }}
                              placeholder="minecraft:diamond" />
                          </div>
                          <div className="inspector-panel-row">
                            <div className="inspector-panel-field"><label>Count</label><input type="number" value={rew.item_count} onChange={(e) => updateInspectorReward(idx, 'item_count', Number(e.target.value))} /></div>
                            <div className="inspector-panel-field"><label>Weight</label><input type="number" step="0.1" value={rew.weight} onChange={(e) => updateInspectorReward(idx, 'weight', Number(e.target.value))} /></div>
                          </div>
                          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                            <label>NBT Data</label>
                            <input type="text" value={rew.nbt_data} onChange={(e) => updateInspectorReward(idx, 'nbt_data', e.target.value)} />
                          </div>
                        </>
                      )}
                      {rew.reward_type === 'experience' && (
                        <div className="inspector-panel-row">
                          <div className="inspector-panel-field"><label>XP Amount</label><input type="number" value={rew.xp_amount} onChange={(e) => updateInspectorReward(idx, 'xp_amount', Number(e.target.value))} /></div>
                          <div className="inspector-panel-field"><label>XP Levels</label><input type="number" value={rew.xp_levels} onChange={(e) => updateInspectorReward(idx, 'xp_levels', Number(e.target.value))} /></div>
                        </div>
                      )}
                      {rew.reward_type === 'command' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Command</label>
                          <input type="text" value={rew.command} onChange={(e) => updateInspectorReward(idx, 'command', e.target.value)} placeholder="/give @p minecraft:diamond" />
                        </div>
                      )}
                      {rew.reward_type === 'loot_table' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Loot Table</label>
                          <input type="text" value={rew.loot_table} onChange={(e) => updateInspectorReward(idx, 'loot_table', e.target.value)} placeholder="minecraft:chests/simple_dungeon" />
                        </div>
                      )}
                      {rew.reward_type === 'game_stage' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Game Stage</label>
                          <input type="text" value={rew.game_stage} onChange={(e) => updateInspectorReward(idx, 'game_stage', e.target.value)} />
                        </div>
                      )}
                      {rew.reward_type === 'choice' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Choices (one ID per line)</label>
                          <textarea rows={3} value={rew.choices.join('\n')} onChange={(e) => updateInspectorReward(idx, 'choices', e.target.value.split('\n').filter(Boolean))} placeholder={"minecraft:diamond\nminecraft:emerald"} />
                        </div>
                      )}
                      {rew.reward_type === 'xp_levels' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>XP Levels</label>
                          <input type="number" value={rew.xp_levels} onChange={(e) => updateInspectorReward(idx, 'xp_levels', Number(e.target.value))} />
                        </div>
                      )}
                      {rew.reward_type === 'advancement' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Advancement ID</label>
                          <input type="text" value={rew.advancement_id || ''} onChange={(e) => updateInspectorReward(idx, 'advancement_id', e.target.value)} placeholder="minecraft:adventure/root" />
                        </div>
                      )}
                      {rew.reward_type === 'toast' && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Toast Message</label>
                          <input type="text" value={rew.toast_message || ''} onChange={(e) => updateInspectorReward(idx, 'toast_message', e.target.value)} />
                        </div>
                      )}
                      {isTableReward(rew.reward_type) && (
                        <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                          <label>Loot Table</label>
                          <input type="text" value={rew.table_id || ''} onChange={(e) => updateInspectorReward(idx, 'table_id', e.target.value)} placeholder="minecraft:gameplay/simple_loot_table" />
                        </div>
                      )}
                      <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                        <label>Description</label>
                        <input type="text" value={rew.description} onChange={(e) => updateInspectorReward(idx, 'description', e.target.value)} />
                      </div>
                      <label className="inspector-panel-checkbox">
                        <input type="checkbox" checked={rew.team_reward} onChange={(e) => updateInspectorReward(idx, 'team_reward', e.target.checked)} />
                        Team Reward
                      </label>
                    </div>
                  ))}
                  <button className="inspector-panel-add-btn" onClick={addInspectorReward}>+ Add Reward</button>
                </div>
              )}

              {/* ─── Advanced Tab ─── */}
              {inspectorTab === 'advanced' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="inspector-panel-section-title">Behavior</div>
                  <label className="inspector-panel-checkbox">
                    <input type="checkbox" checked={editRepeatable} onChange={(e) => { setEditRepeatable(e.target.checked); liveSaveField('can_be_repeatable', e.target.checked) }} />
                    Repeatable
                  </label>
                  {editRepeatable && (
                    <div className="inspector-panel-row">
                      <div className="inspector-panel-field"><label>Repeat Time</label><input type="number" value={editRepeatTime} onChange={(e) => { setEditRepeatTime(Number(e.target.value)); liveSaveField('repeat_time', Number(e.target.value)) }} /></div>
                      <div className="inspector-panel-field"><label>Min Delay</label><input type="number" value={editRepeatMinDelay} onChange={(e) => { setEditRepeatMinDelay(Number(e.target.value)); liveSaveField('repeat_min_delay', Number(e.target.value)) }} /></div>
                      <div className="inspector-panel-field"><label>Max Delay</label><input type="number" value={editRepeatMaxDelay} onChange={(e) => { setEditRepeatMaxDelay(Number(e.target.value)); liveSaveField('repeat_max_delay', Number(e.target.value)) }} /></div>
                    </div>
                  )}
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editSilentComplete} onChange={(e) => { setEditSilentComplete(e.target.checked); liveSaveField('silently_complete', e.target.checked) }} /> Silent Complete</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideDeps} onChange={(e) => { setEditHideDeps(e.target.checked); liveSaveField('hide_quest_until_deps_complete', e.target.checked) }} /> Hide Until Deps Done</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideQuest} onChange={(e) => { setEditHideQuest(e.target.checked); liveSaveField('hide_quest_until_quest_complete', e.target.checked) }} /> Hide Until Quest Done</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideAll} onChange={(e) => { setEditHideAll(e.target.checked); liveSaveField('hide_quest_until_all_complete', e.target.checked) }} /> Hide Until All Done</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editDisableReward} onChange={(e) => { setEditDisableReward(e.target.checked); liveSaveField('disable_reward', e.target.checked) }} /> Disable Reward</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editPauseReward} onChange={(e) => { setEditPauseReward(e.target.checked); liveSaveField('pause_reward', e.target.checked) }} /> Pause Reward</label>

                  <div className="inspector-panel-section-title">Appearance</div>
                  <div className="inspector-panel-row">
                    <div className="inspector-panel-field">
                      <label>Shape</label>
                      <select value={editShape} onChange={(e) => { setEditShape(e.target.value); liveSaveField('shape', e.target.value) }}>
                        {SHAPES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                      </select>
                    </div>
                    <div className="inspector-panel-field">
                      <label>Icon Scaling</label>
                      <input type="number" step="0.1" min="0.1" max="10" value={editIconScaling} onChange={(e) => { setEditIconScaling(Number(e.target.value)); liveSaveField('icon_scaling', Number(e.target.value)) }} />
                    </div>
                  </div>
                  <div className="inspector-panel-field">
                    <label>Tags (comma-separated)</label>
                    <input type="text" value={editTags} onChange={(e) => { setEditTags(e.target.value); liveSaveField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean)) }} placeholder="tutorial, early-game" />
                  </div>

                  <div className="inspector-panel-section-title">Progression</div>
                  <div className="inspector-panel-field">
                    <label>Progression Mode</label>
                    <select value={editProgressionMode} onChange={(e) => { setEditProgressionMode(e.target.value); liveSaveField('progression_mode', e.target.value) }}>
                      {PROGRESSION_MODES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                    </select>
                  </div>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editSequentialTasks} onChange={(e) => { setEditSequentialTasks(e.target.checked); liveSaveField('sequential_tasks', e.target.checked) }} /> Sequential Tasks</label>

                  <div className="inspector-panel-section-title">Misc</div>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editDisableToast} onChange={(e) => { setEditDisableToast(e.target.checked); liveSaveField('disable_completion_toast', e.target.checked) }} /> Disable Completion Toast</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editIgnoreRewardBlocking} onChange={(e) => { setEditIgnoreRewardBlocking(e.target.checked); liveSaveField('ignore_reward_blocking', e.target.checked) }} /> Ignore Reward Blocking</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editDisableJei} onChange={(e) => { setEditDisableJei(e.target.checked); liveSaveField('disable_jei_recipe', e.target.checked) }} /> Disable JEI Recipe</label>

                  <div className="inspector-panel-section-title">Visibility Advanced</div>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideDetailsUntilStartable} onChange={(e) => { setEditHideDetailsUntilStartable(e.target.checked); liveSaveField('hide_details_until_startable', e.target.checked) }} /> Hide Details Until Startable</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideTextUntilCompleted} onChange={(e) => { setEditHideTextUntilCompleted(e.target.checked); liveSaveField('hide_text_until_completed', e.target.checked) }} /> Hide Text Until Completed</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editInvisibleUntilCompleted} onChange={(e) => { setEditInvisibleUntilCompleted(e.target.checked); liveSaveField('invisible_until_completed', e.target.checked) }} /> Invisible Until Completed</label>
                  <div className="inspector-panel-field">
                    <label>Invisible Until X Tasks Done</label>
                    <input type="number" value={editInvisibleUntilXTasks} onChange={(e) => { setEditInvisibleUntilXTasks(Number(e.target.value)); liveSaveField('invisible_until_x_tasks', Number(e.target.value)) }} />
                  </div>

                  <div className="inspector-panel-section-title">Dependencies</div>
                  <div className="inspector-panel-field">
                    <label>Dependency Requirement</label>
                    <select value={editDepRequirement} onChange={(e) => { setEditDepRequirement(e.target.value); liveSaveField('dependency_requirement', e.target.value) }}>
                      {DEPENDENCY_REQUIREMENTS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
                    </select>
                  </div>
                  <div className="inspector-panel-field">
                    <label>Min Required Dependencies</label>
                    <input type="number" min="0" value={editMinReqDeps} onChange={(e) => { setEditMinReqDeps(Number(e.target.value)); liveSaveField('min_required_dependencies', Number(e.target.value)) }} />
                  </div>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideDepLines} onChange={(e) => { setEditHideDepLines(e.target.checked); liveSaveField('hide_dependency_lines', e.target.checked) }} /> Hide Dependency Lines</label>
                  <label className="inspector-panel-checkbox"><input type="checkbox" checked={editHideDeptLines} onChange={(e) => { setEditHideDeptLines(e.target.checked); liveSaveField('hide_dependent_lines', e.target.checked) }} /> Hide Dependent Lines</label>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="inspector-panel-delete">
              <button className="inspector-panel-delete-btn" onClick={deleteSelectedNode}>Delete Quest</button>
            </div>
          </>
        )}
        {!selectedNode && (
          <div className="inspector-panel-empty">
            <div className="inspector-panel-empty-icon">📜</div>
            <div>Select a quest to edit</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Right-click canvas to create, or use + Add Quest</div>
          </div>
        )}
      </div>

    {/* ─── Status Bar ─── */}
    <div className="quest-editor-statusbar">
      <div className="quest-editor-statusbar-left">
        <span className="quest-editor-statusbar-item">
          {graph?.chapters.length || 0} chapters
        </span>
        <span className="quest-editor-statusbar-separator" />
        <span className="quest-editor-statusbar-item">
          {filteredNodes.length} quests
        </span>
        {activeChapter && (
          <>
            <span className="quest-editor-statusbar-separator" />
            <span className="quest-editor-statusbar-item">
              {chapterQuestCounts[activeChapter] || 0} in chapter
            </span>
          </>
        )}
      </div>
      <div className="quest-editor-statusbar-right">
        <span className="quest-editor-statusbar-item">
          Zoom: {Math.round(viewportPos.zoom * 100)}%
        </span>
        <span className="quest-editor-statusbar-separator" />
        <span className="quest-editor-statusbar-item">
          {Object.keys(textureIndex).length} textures
        </span>
        {selectedNodeId && (
          <>
            <span className="quest-editor-statusbar-separator" />
            <span className="quest-editor-statusbar-item">
              Selected: {selectedLabel}
            </span>
          </>
        )}
      </div>
    </div>

        {/* ─── Analysis Modal ─── */}
      {showAnalysis && analysis && (
        <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="modal analysis-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Quest Analysis</h2>
            <div className="analysis-grid">
              <div className="analysis-stat"><div className="stat-value">{analysis.total_quests}</div><div className="stat-label">Quests</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_chapters}</div><div className="stat-label">Chapters</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_objectives}</div><div className="stat-label">Objectives</div></div>
              <div className="analysis-stat"><div className="stat-value">{analysis.total_rewards}</div><div className="stat-label">Rewards</div></div>
            </div>
            {analysis.issues.length > 0 && (
              <div className="analysis-issues"><h3>Issues</h3>
                {analysis.issues.map((issue, i) => <div key={i} className={`issue-${issue.severity}`}>{issue.message}</div>)}
              </div>
            )}
            {analysis.chapters.length > 0 && (
              <div className="analysis-section"><h3>Chapters</h3>
                {analysis.chapters.map((ch) => <div key={ch.chapter_id} className="chapter-item"><strong>{ch.chapter_label}</strong> — {ch.quest_count} quest{ch.quest_count !== 1 ? 's' : ''}</div>)}
              </div>
            )}
            {analysis.orphaned_quests.length > 0 && (
              <div className="analysis-section"><h3>Orphaned Quests</h3>
                {analysis.orphaned_quests.map((q) => <div key={q.quest_id} className="orphan-item">{q.quest_label}</div>)}
              </div>
            )}
            {analysis.incomplete_quests.length > 0 && (
              <div className="analysis-section"><h3>Incomplete Quests</h3>
                {analysis.incomplete_quests.map((q) => <div key={q.quest_id} className="incomplete-item"><strong>{q.quest_label}</strong>{q.missing_objectives === 0 && ' — no objectives'}{q.missing_rewards && ' — no rewards'}</div>)}
              </div>
            )}
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setShowAnalysis(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ─── Chapter Groups Modal ─── */}
      {showGroups && (
        <div className="modal-overlay" onClick={() => setShowGroups(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Chapter Groups</h2>
            <div className="groups-list">
              {editGroups.map((g, i) => (
                <div key={g.id} className="group-card">
                  <div className="group-card-header">
                    <span className="group-index">#{i + 1}</span>
                    <button className="btn-remove" onClick={() => setEditGroups(editGroups.filter((_, idx) => idx !== i))}>×</button>
                  </div>
                  <div className="inspector-field compact">
                    <label>Title</label>
                    <input type="text" value={g.title} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], title: e.target.value }; setEditGroups(ng) }} />
                  </div>
                  <div className="inspector-field compact">
                    <label>Description</label>
                    <input type="text" value={g.description} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], description: e.target.value }; setEditGroups(ng) }} />
                  </div>
                  <div className="inspector-row">
                    <div className="inspector-field half compact">
                      <label>Icon</label>
                      <input type="text" value={g.icon} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], icon: e.target.value }; setEditGroups(ng) }} />
                    </div>
                    <div className="inspector-field half compact">
                      <label>Order</label>
                      <input type="number" value={g.order_index} onChange={(e) => { const ng = [...editGroups]; ng[i] = { ...ng[i], order_index: Number(e.target.value) }; setEditGroups(ng) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setEditGroups([...editGroups, { id: crypto.randomUUID(), title: 'New Group', description: '', icon: '', order_index: editGroups.length }])}>+ Add Group</button>
              <button className="btn-success" onClick={saveGroups}>Save</button>
              <button className="btn-secondary" onClick={() => setShowGroups(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Book Settings Modal ─── */}
      {showBookSettings && (
        <div className="modal-overlay" onClick={() => setShowBookSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Book Settings</h2>
            <div className="inspector-field">
              <label>Book Progression Mode</label>
              <select value={editBookProgressionMode} onChange={(e) => setEditBookProgressionMode(e.target.value)}>
                {PROGRESSION_MODES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="inspector-field">
              <label>Book Icon (item id)</label>
              <input type="text" value={editBookIcon} onChange={(e) => setEditBookIcon(e.target.value)} placeholder="minecraft:book" />
            </div>
            <div className="inspector-field">
              <label>Background Image URL</label>
              <input type="text" value={editBookBgImage} onChange={(e) => setEditBookBgImage(e.target.value)} placeholder="https://..." />
            </div>
            <div className="inspector-row">
              <div className="inspector-field half">
                <label>Quest Color (hex)</label>
                <input type="color" value={editQuestColor || '#3b82f6'} onChange={(e) => setEditQuestColor(e.target.value)} />
              </div>
              <div className="inspector-field half">
                <label>Default Quest Shape</label>
                <select value={editDefaultQuestShape} onChange={(e) => setEditDefaultQuestShape(e.target.value)}>
                  {SHAPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="inspector-row">
              <div className="inspector-field half">
                <label>Default Quest Width</label>
                <input type="number" value={editDefaultQuestWidth} onChange={(e) => setEditDefaultQuestWidth(Number(e.target.value))} />
              </div>
              <div className="inspector-field half">
                <label>Default Quest Height</label>
                <input type="number" value={editDefaultQuestHeight} onChange={(e) => setEditDefaultQuestHeight(Number(e.target.value))} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-success" onClick={saveBookSettings}>Save</button>
              <button className="btn-secondary" onClick={() => setShowBookSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Icon Picker Modal ─── */}
      {showIconPicker && (
        <div className="modal-overlay" onClick={() => setShowIconPicker(false)}>
          <div className="modal icon-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pick Icon</h2>
            {!modsDir ? (
              <div style={{ padding: '16px 0', color: 'var(--color-text-muted)' }}>
                <p>Set a mods directory first to load textures from .jar files.</p>
                <button className="btn-primary" style={{ marginTop: 8 }} onClick={browseModsDir}>Set Mods Directory</button>
              </div>
            ) : (
              <>
                <div className="inspector-field compact">
                  <input type="text" placeholder="Search textures... (e.g. diamond, minecraft:)" value={iconPickerSearch} onChange={(e) => setIconPickerSearch(e.target.value)} autoFocus />
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  {filteredTextures.length} texture{filteredTextures.length !== 1 ? 's' : ''} found
                </div>
                <div className="icon-picker-grid">
                  {filteredTextures.slice(0, 200).map(([itemId, dataUrl]) => (
                    <button
                      key={itemId}
                      className={`icon-picker-item ${editIcon === itemId ? 'selected' : ''}`}
                      onClick={() => { setEditIcon(itemId); setShowIconPicker(false) }}
                      title={itemId}
                    >
                      <img src={dataUrl} alt={itemId} style={{ width: 32, height: 32, imageRendering: 'pixelated' }} />
                      <span className="icon-picker-label">{itemId.split(':').pop()}</span>
                    </button>
                  ))}
                  {filteredTextures.length > 200 && (
                    <div className="icon-picker-more">+{filteredTextures.length - 200} more (narrow your search)</div>
                  )}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowIconPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <div className="context-menu-overlay" onClick={closeContextMenu}>
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.nodeId ? (
              <>
                <button className="context-menu-item" onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId)
                  if (node) selectNode(node)
                  closeContextMenu()
                }}>Edit</button>
                <button className="context-menu-item" onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId)
                  if (node) { setClipboard(node) }
                  closeContextMenu()
                }}>Copy</button>
                <div className="context-menu-separator" />
                <button className="context-menu-item danger" onClick={() => { if (contextMenu.nodeId) deleteNodeById(contextMenu.nodeId) }}>Delete</button>
              </>
            ) : (
              <>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('quest')}>Add Quest</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('side_quest')}>Add Side Quest</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('reward')}>Add Reward</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('gate')}>Add Gate</button>
                {clipboard && (
                  <>
                    <div className="context-menu-separator" />
                    <button className="context-menu-item" onClick={pasteNode}>Paste</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

