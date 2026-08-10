// Props for the config editor. Split out of `config-editor.tsx` so the main
// component module stays under the 300-line budget.

import type { ConfigValue } from '../../../core/config/types'

export interface ConfigValueEditorProps {
  value: ConfigValue
  path: string[]
  onChange: (path: string[], value: ConfigValue) => void
  depth?: number
  query?: string
  collapsed?: boolean
  onAddArrayItem?: (path: string[]) => void
  onRemoveAt?: (path: string[]) => void
  onAddField?: (path: string[]) => void
  onMoveArrayItem?: (arrayPath: string[], from: number, to: number) => void
  onDuplicateAt?: (path: string[]) => void
}

/** Display name for a config path's last segment (`[]` shows as `[item]`). */
export function keyName(path: string[]): string {
  const last = path[path.length - 1]
  return last === '[]' ? '[item]' : last
}
