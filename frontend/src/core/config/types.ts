// Shared config-editor types. These mirror the backend `config_parser`
// `ConfigValue` enum (serde tag "type") so structured values round-trip
// 1:1 through the Tauri commands. Pure data — no UI, no I/O.

export type ConfigValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'object'
  | 'color'
  | 'group'

export interface ConfigValue {
  type: ConfigValueType
  value?: string | number | boolean
  fields?: Record<string, ConfigValue>
  items?: ConfigValue[]
  options?: string[]
  comment?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  label?: string
}

export interface ParsedConfig {
  format: string
  root: ConfigValue
  raw: string
}

export interface ConfigFileInfo {
  path: string
  name: string
  format: string
  size: number
}
