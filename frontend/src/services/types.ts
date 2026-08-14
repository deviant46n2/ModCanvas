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

/** A starter content package the First-Pack wizard can scaffold (ids owned by Rust). */
export interface ProjectTemplate {
  id: string
  name: string
  description: string
}

/** Everything `create_project` needs — the wizard derives it from user picks. */
export interface CreateProjectInput {
  name: string
  mcVersion: string
  modLoader: string
  path: string
  templateId: string | null
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

/** One-click install data for a missing dependency (Rust-owned, mirrors
 *  `CompatibilityInstall` in models.rs). Modrinth-only since s54: the one-click
 *  installer is keyless and Modrinth-only; CurseForge deps render without a
 *  button (installs execute in Prism). Null on an issue means the dep could
 *  not be resolved at check time — no button, no blind install. */
export interface CompatibilityInstall {
  mod_id: string
  slug: string
  name: string
}

export interface CompatibilityIssue {
  severity: string
  message: string
  affected_mods: string[]
  affected_mod_names: string[]
  install: CompatibilityInstall | null
}

export interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: string[]
}

/** A curated mod the First-Pack wizard can offer (filtered by Rust to what
 *  the pack's loader/version actually supports; `ticked` is the default).
 *  `core` picks back a ModCanvas feature (quest book, recipe scripting) and
 *  render in their own section; `blocked_reason` flags a pick whose metadata
 *  could not be verified (fetch failure, version/loader mismatch) instead of
 *  hiding it. Modrinth picks install in-app; CurseForge picks install through
 *  Prism (the wizard guides that flow). */
export interface CuratedMod {
  source: 'modrinth' | 'curseforge'
  mod_id: string
  slug: string
  name: string
  description: string
  ticked: boolean
  core: boolean
  blocked_reason: string | null
  /** Project page for manual download, offered in the blocked box (s48). */
  page_url: string | null
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
  clientCount: number
  port: number
}

export interface ModEvent {
  event: string
  timestamp: number
  path?: string
  payload?: any
}

export interface GeneratedScripts {
  kubejs: string;
  crafttweaker: string;
}

export type RecipeOrigin = 'vanilla' | 'kubejs' | 'crafttweaker';

export interface DiscoveredRecipe {
  recipe: import('../core/recipe/recipe-store').Recipe;
  origin: RecipeOrigin;
  source: string;
  id: string;
  label: string;
  editable: boolean;
  /** 1-based line range of the call in `source` (KubeJS/CraftTweaker only). */
  span?: { start: number; end: number } | null;
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
