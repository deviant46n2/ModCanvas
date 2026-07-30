import { invoke } from '@tauri-apps/api/core'

// ── Shared Types ────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  minecraft_version: string
  mod_loader: string
  pack_version: string
  author: string
  created_at: string
  updated_at: string
  path: string
}

export interface ImportResult {
  project: Project
  mods: Array<{ mod_id: string; slug: string; name: string; version: string; source: string }>
  unresolved_mods: Array<{ file_name: string; mod_id: string | null; version: string | null; loader: string | null }>
  config_files: Array<{ path: string; content: string; format: string }>
}

export interface ModDependency {
  mod_id: string
  dependency_type: string
}

export interface ModMetadata {
  mod_id: string
  slug: string
  name: string
  description: string
  author: string
  categories: string[]
  dependencies: ModDependency[]
  supported_loaders: string[]
  supported_versions: string[]
  downloads: number
  source_url: string | null
  issues_url: string | null
  documentation_url: string | null
}

export interface CompatibilityIssue {
  severity: string
  message: string
  affected_mods: string[]
  affected_mod_names: string[]
}

export interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: string[]
}

export interface ConfigFileInfo {
  path: string
  name: string
  format: string
  size: number
}

export interface ConfigValue {
  type: string
  value?: string | number | boolean
  fields?: Record<string, ConfigValue>
  items?: ConfigValue[]
  options?: string[]
  comment?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface ParsedConfig {
  format: string
  root: ConfigValue
  raw: string
}

// ── Quest Types ─────────────────────────────────────────────────────────────

export interface QuestSize {
  width: number
  height: number
}

export interface QuestChapter {
  id: string
  title: string
  description: string
  icon: string
  background_image: string
  order_index: number
  hide_until_first_quest_complete: boolean
  default_quest_size: { width: number; height: number }
  quest_color: string
  group_id: string | null
  default_quest_shape: string
  default_enabled: boolean
  progression_mode: string
}

export interface QuestChapterGroup {
  id: string
  title: string
  description: string
  icon: string
  order_index: number
}

export interface QuestObjectiveData {
  id: string
  label: string
  objective_type: string
  target: string
  target_count: number
  required: boolean
  item_tag: string
  nbt_data: string
  consume_items: boolean
  match_nbt: boolean
  ignore_nbt: boolean
  exact_match: boolean
  fluid_id: string
  fluid_amount: number
  energy_amount: number
  energy_unit: string
  xp_levels: number
  xp_points: number
  command: string
  dimension: string
  x: number
  y: number
  z: number
  radius: number
  entity_id: string
  advancement_id: string
  custom_json: string
  description: string
  stat_name: string
  stat_value: number
  biome_id: string
  structure_id: string
  observation_range: number
}

export interface QuestRewardData {
  id: string
  label: string
  reward_type: string
  items: string[]
  description: string
  item_id: string
  item_tag: string
  item_count: number
  nbt_data: string
  xp_amount: number
  xp_levels: number
  command: string
  loot_table: string
  game_stage: string
  weight: number
  reward_chests: string[]
  team_reward: boolean
  toast_message: string
  table_id: string
  choices: string[]
  advancement_id: string
}

export interface QuestNodeData {
  id: string
  node_type: string
  label: string
  description: string
  position: { x: number; y: number }
  data: Record<string, string>
  objectives: QuestObjectiveData[]
  rewards: QuestRewardData[]
  required_items: string[]
  chapter_id: string | null
  icon: string
  size: QuestSize
  color: string
  visibility: string
  optional: boolean
  silently_complete: boolean
  can_be_repeatable: boolean
  repeat_min_delay: number
  repeat_max_delay: number
  repeat_time: number
  hide_quest_until_deps_complete: boolean
  hide_quest_until_quest_complete: boolean
  hide_quest_until_all_complete: boolean
  disable_reward: boolean
  pause_reward: boolean
  lock_icon: string
  subtitle: string
  quest_background: string
  shape: string
  icon_scaling: number
  tags: string[]
  progression_mode: string
  sequential_tasks: boolean
  disable_completion_toast: boolean
  ignore_reward_blocking: boolean
  disable_jei_recipe: boolean
  min_window_width: number
  hide_details_until_startable: boolean
  hide_text_until_completed: boolean
  invisible_until_completed: boolean
  invisible_until_x_tasks: number
  hide_dependency_lines: boolean
  hide_dependent_lines: boolean
  min_required_dependencies: number
  dependency_requirement: string
}

export interface QuestEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
  inverted: boolean
}

export interface QuestGraphData {
  id: string
  project_id: string
  name: string
  description: string
  chapters: QuestChapter[]
  chapter_groups: QuestChapterGroup[]
  nodes: QuestNodeData[]
  edges: QuestEdgeData[]
  book_progression_mode: string
  book_icon: string
  book_background_image: string
  quest_color: string
  default_quest_size: QuestSize
  default_quest_shape: string
}

export interface QuestAnalysis {
  total_quests: number
  total_chapters: number
  total_objectives: number
  total_rewards: number
  orphaned_quests: Array<{ quest_id: string; quest_label: string }>
  incomplete_quests: Array<{ quest_id: string; quest_label: string; missing_objectives: number; missing_rewards: boolean }>
  chapters: Array<{ chapter_id: string; chapter_label: string; quest_count: number }>
  issues: Array<{ severity: string; message: string; node_id: string | null }>
}

export interface FtbQuestsImportResult {
  graph: QuestGraphData
  format: string
  layout: string
  quest_count: number
  chapter_count: number
}

// ── Progression Types ───────────────────────────────────────────────────────

export interface ProgressionNodeData {
  id: string
  node_type: string
  label: string
  description: string
  position: { x: number; y: number }
  data: Record<string, string>
  mod_refs: string[]
  item_refs: string[]
  chapter_id: string | null
  phase: string
  stage_name: string
  icon: string
  color: string
}

export interface ProgressionEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
}

export interface ProgressionGraphData {
  id: string
  project_id: string
  name: string
  description: string
  nodes: ProgressionNodeData[]
  edges: ProgressionEdgeData[]
  mod_names: Record<string, string>
  chapters: Array<{ id: string; title: string; description: string; order_index: number }>
}

export interface ProgressionAnalysis {
  total_nodes: number
  total_edges: number
  phases: string[]
  bottlenecks: Array<{ node_id: string; node_label: string; incoming_count: number; severity: string }>
  dead_ends: string[]
  unreachable_nodes: string[]
  coverage: { mods_used: string[]; mods_unused: string[]; total_mods: number; coverage_percent: number }
  issues: Array<{ severity: string; message: string; node_id: string | null }>
}

// ── WebSocket IPC ──────────────────────────────────────────────────────────────

export interface WsConnectionStatus {
  connected: boolean
  client_count: number
  port: number
}

export interface ModEvent {
  event: string
  timestamp: number
  path?: string
  payload?: any
}

export async function wsIpcSendEvent(
  eventType: string,
  path?: string,
  payload?: any,
): Promise<number> {
  return invoke<number>('ws_ipc_send_event', { eventType, path, payload })
}

export async function wsIpcGetStatus(): Promise<WsConnectionStatus> {
  return invoke<WsConnectionStatus>('ws_ipc_get_status')
}

export async function wsIpcRestart(): Promise<void> {
  return invoke('ws_ipc_restart')
}

// ── Project ─────────────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  minecraftVersion: string,
  modLoader: string,
  path: string,
): Promise<Project> {
  return invoke<Project>('create_project', { name, minecraftVersion, modLoader, path })
}

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_projects')
}

export async function saveProject(projectId: string): Promise<void> {
  return invoke('save_project', { projectId })
}

export async function deleteProject(projectId: string): Promise<void> {
  return invoke('delete_project', { projectId })
}

export async function testProject(
  projectId: string,
  username: string,
  minMem: string,
  maxMem: string,
): Promise<void> {
  return invoke('test_project', { projectId, username, minMem, maxMem })
}

// ── Import / Export ─────────────────────────────────────────────────────────

export async function autoImportPack(path: string): Promise<ImportResult> {
  return invoke<ImportResult>('auto_import_pack', { path })
}

export async function exportModrinthMrpack(projectId: string): Promise<string> {
  return invoke<string>('export_modrinth_mrpack', { projectId })
}

export async function exportCurseforgeZip(projectId: string): Promise<string> {
  return invoke<string>('export_curseforge_zip', { projectId })
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getCurseforgeApiKey(): Promise<string | null> {
  return invoke<string | null>('get_curseforge_api_key')
}

export async function setCurseforgeApiKey(key: string): Promise<void> {
  return invoke('set_curseforge_api_key', { key })
}

export async function openPrismLauncher(): Promise<void> {
  return invoke('open_prism_launcher')
}

// ── Mods ────────────────────────────────────────────────────────────────────

export async function addMod(
  projectId: string,
  modId: string,
  slug: string,
  name: string,
  version: string,
  description: string,
  author: string,
  source: string,
  enabled?: boolean,
): Promise<void> {
  const args: Record<string, unknown> = { projectId, modId, slug, name, version, description, author, source }
  if (enabled !== undefined) args.enabled = enabled
  return invoke('add_mod', args)
}

export async function removeMod(projectId: string, modId: string): Promise<void> {
  return invoke('remove_mod', { projectId, modId })
}

export async function getProjectMods(projectId: string): Promise<any[]> {
  return invoke<any[]>('get_project_mods', { projectId })
}

export async function scanInstanceMods(projectId: string): Promise<any[]> {
  return invoke<any[]>('scan_instance_mods', { projectId })
}

export async function deployCompanionMod(projectId: string): Promise<void> {
  return invoke('deploy_companion_mod_for_project', { projectId })
}

export async function getProjectModMetadata(projectId: string): Promise<ModMetadata[]> {
  return invoke<ModMetadata[]>('get_project_mod_metadata', { projectId })
}

export async function getDepNames(
  modIds: string[],
): Promise<Array<{ mod_id: string; slug: string; name: string }>> {
  return invoke<Array<{ mod_id: string; slug: string; name: string }>>('get_dep_names', { modIds })
}

export async function checkCompatibility(projectId: string): Promise<CompatibilityResult> {
  return invoke<CompatibilityResult>('check_compatibility_async', { projectId })
}

export async function searchMods(
  query: string,
  loader: string,
  mcVersion: string,
): Promise<ModMetadata[]> {
  return invoke<ModMetadata[]>('search_mods', { query, loader, mcVersion })
}

// ── Item/Tag Search (for Recipe Editor) ──────────────────────────────────────
export interface SearchResult {
  id: string;
  name: string;
  texture_url: string | null;
  tags: string[];
  source: string;
  mod_id: string | null;
  version: string | null;
}

export interface TagInfo {
  id: string;
  name: string;
  member_count: number;
  description: string | null;
}

export async function searchItems(
  query: string,
  loader: string,
  mcVersion: string,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_items', { query, loader, mcVersion })
}

export async function searchTags(
  query: string,
  loader: string,
  mcVersion: string,
): Promise<TagInfo[]> {
  return invoke<TagInfo[]>('search_tags', { query, loader, mcVersion })
}

export async function getItemDetails(
  itemId: string,
): Promise<SearchResult | null> {
  return invoke<SearchResult | null>('get_item_details', { itemId })
}

// ── Config ──────────────────────────────────────────────────────────────────

export async function listConfigFiles(projectId: string): Promise<ConfigFileInfo[]> {
  return invoke<ConfigFileInfo[]>('list_config_files', { projectId })
}

export async function readConfigFile(path: string): Promise<string> {
  return invoke<string>('read_config_file', { path })
}

export async function writeConfigFile(path: string, content: string): Promise<void> {
  return invoke('write_config_file', { path, content })
}

export async function parseConfigFile(path: string): Promise<ParsedConfig> {
  return invoke<ParsedConfig>('parse_config_file', { path })
}

export async function saveStructuredConfig(path: string, config: ConfigValue): Promise<void> {
  return invoke('save_structured_config', { path, config })
}

// ── Quests ──────────────────────────────────────────────────────────────────

export async function getQuestGraph(projectId: string): Promise<QuestGraphData> {
  return invoke<QuestGraphData>('get_quest_graph', { projectId })
}

export async function saveQuestGraph(projectId: string, graph: QuestGraphData): Promise<void> {
  return invoke('save_quest_graph', { projectId, graph })
}

export async function analyzeQuestGraph(projectId: string): Promise<QuestAnalysis> {
  return invoke<QuestAnalysis>('analyze_quest_graph', { projectId })
}

export async function importFtbQuestsFromDir(packDir: string): Promise<FtbQuestsImportResult> {
  return invoke<FtbQuestsImportResult>('import_ftb_quests_from_dir', { packDir })
}

export async function exportFtbQuestsToDir(projectId: string, outputDir: string): Promise<void> {
  return invoke('export_ftb_quests_to_dir', { projectId, outputDir })
}

// ── Textures ────────────────────────────────────────────────────────────────

export async function scanModJarTextures(modsDir: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_mod_jar_textures', { modsDir })
}

// ── Progression ─────────────────────────────────────────────────────────────

export async function getProgressionGraph(projectId: string): Promise<ProgressionGraphData> {
  return invoke<ProgressionGraphData>('get_progression_graph', { projectId })
}

export async function saveProgressionGraph(
  projectId: string,
  graph: ProgressionGraphData,
): Promise<void> {
  return invoke('save_progression_graph', { projectId, graph })
}

export async function analyzeProgression(projectId: string): Promise<ProgressionAnalysis> {
  return invoke<ProgressionAnalysis>('analyze_progression', { projectId })
}

export async function autoGenerateProgression(projectId: string): Promise<ProgressionGraphData> {
  return invoke<ProgressionGraphData>('auto_generate_progression', { projectId })
}
