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
  /** Origin: `"modcanvas"` (manual / imported) or `"prism"` (Prism-synced). */
  source: string
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
  icon: string | null
  source: 'modrinth' | 'curseforge'
  /** Human-readable reason when a search result doesn't exactly match the
   *  requested MC version but is still shown (CurseForge is broader). */
  mismatch?: string | null
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

export interface GeneratedScripts {
  kubejsScript: string;
  crafttweakerScript: string;
}

export type RecipeOrigin = 'vanilla' | 'kubejs' | 'crafttweaker';

export interface DiscoveredRecipe {
  recipe: import('../core/recipe/recipe-store').Recipe;
  origin: RecipeOrigin;
  source: string;
  id: string;
  label: string;
  editable: boolean;
}

export interface LoadPackProgress {
  stage: 'idle' | 'textures' | 'quests' | 'mods' | 'recipes' | 'complete' | 'error'
  message: string
  progress: number
  error?: string
  /** Current file being processed (e.g. a jar name), when available. */
  file?: string
  /** Items processed so far within the current stage. */
  done?: number
  /** Total items in the current stage. */
  total?: number
}
