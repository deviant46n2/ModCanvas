// Pure helpers for navigating/mutating a ConfigValue tree. These are UI-free
// so they are unit-testable in isolation (Data/Parsers layer). Mutations are
// structural (non-mutating) so callers can build the "before"/"after" states
// needed by the history system.

import type { ConfigValue } from './types'

/** Resolve the child at `key` (object/group field or array index). */
function childOf(value: ConfigValue, key: string): ConfigValue | undefined {
  if (value.type === 'object' || value.type === 'group') {
    return value.fields?.[key]
  }
  if (value.type === 'array') {
    return value.items?.[Number(key)]
  }
  return undefined
}

/** Walk `path` from `root` (inclusive of the final segment). */
export function getAt(root: ConfigValue, path: string[]): ConfigValue | undefined {
  let current: ConfigValue | undefined = root
  for (const key of path) {
    if (current === undefined) return undefined
    current = childOf(current, key)
  }
  return current
}

/** Clone a ConfigValue tree (used to snapshot before/after for history). */
export function deepClone(value: ConfigValue): ConfigValue {
  return JSON.parse(JSON.stringify(value)) as ConfigValue
}

/**
 * Produce a sensible default value for an array element or a new object field.
 * Uses the first existing sibling (for arrays) or a plain string (new keys) as
 * the shape template so newly added entries are editable immediately.
 */
export function defaultChild(
  template: ConfigValue | undefined,
  fallback = 'string',
): ConfigValue {
  const type = template?.type ?? fallback
  switch (type) {
    case 'number':
      return { type: 'number', value: 0, step: template?.step }
    case 'boolean':
      return { type: 'boolean', value: false }
    case 'enum':
      return { type: 'enum', value: template?.options?.[0] ?? '', options: template?.options ?? [] }
    case 'color':
      return { type: 'color', value: '#FFFFFF' }
    case 'array':
      return { type: 'array', items: [] }
    case 'object':
      return { type: 'object', fields: {} }
    case 'group':
      return { type: 'group', label: template?.label ?? 'group', fields: {} }
    case 'string':
    default:
      return { type: 'string', value: '' }
  }
}

/** Case-insensitive substring match against a field's key, comment, and value. */
export function matchesQuery(
  value: ConfigValue,
  key: string,
  query: string,
  parents: string[],
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const path = [...parents, key].join('.')
  if (path.toLowerCase().includes(q)) return true
  if (value.comment && value.comment.toLowerCase().includes(q)) return true
  if (typeof value.value === 'string' && value.value.toLowerCase().includes(q)) return true

  if ((value.type === 'object' || value.type === 'group') && value.fields) {
    for (const [k, v] of Object.entries(value.fields)) {
      if (matchesQuery(v, k, query, [...parents, key])) return true
    }
  }
  if (value.type === 'array' && value.items) {
    for (const item of value.items) {
      if (matchesQuery(item, '[]', query, [...parents, key])) return true
    }
  }
  return false
}

/** Collect the leaf paths of a tree that match `query` (same semantics as
 *  `matchesQuery`: key path, comment, or string value). Used by the guided
 *  config-tweak wizard to present matches to pick from. */
export function findMatchingPaths(
  root: ConfigValue,
  query: string,
  parents: string[] = [],
  key = '',
  out: string[][] = [],
): string[][] {
  if (!matchesQuery(root, key, query, parents)) return out
  const path = [...parents, key].filter(Boolean)
  if (root.type === 'object' || root.type === 'group') {
    if (root.fields) {
      for (const [k, v] of Object.entries(root.fields)) {
        findMatchingPaths(v, query, path, k, out)
      }
    }
    // Containers match but have no leaf fields: report the container itself.
    if (!root.fields || Object.keys(root.fields).length === 0) out.push(path)
  } else if (root.type === 'array') {
    if (root.items) {
      root.items.forEach((item, i) => findMatchingPaths(item, query, path, String(i), out))
    }
    if (!root.items || root.items.length === 0) out.push(path)
  } else {
    out.push(path)
  }
  return out
}

/** Non-mutating insert of `child` at `path` in a copy of `root`. */
export function setAt(root: ConfigValue, path: string[], child: ConfigValue): ConfigValue {
  const copy = deepClone(root)
  let current = copy
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if ((current.type === 'object' || current.type === 'group') && current.fields) {
      current = current.fields[key]
    } else if (current.type === 'array' && current.items) {
      current = current.items[Number(key)]
    }
  }
  const lastKey = path[path.length - 1]
  if ((current.type === 'object' || current.type === 'group') && current.fields) {
    current.fields[lastKey] = child
  } else if (current.type === 'array' && current.items) {
    current.items[Number(lastKey)] = child
  }
  return copy
}

/**
 * Non-mutating reorder of an array: move the item currently at `from` to `to`
 * (both index bounds) in the array reachable via `arrayPath`. Returns a copy.
 */
export function moveArrayAt(root: ConfigValue, arrayPath: string[], from: number, to: number): ConfigValue {
  const copy = deepClone(root)
  let current = copy
  for (const key of arrayPath) {
    if ((current.type === 'object' || current.type === 'group') && current.fields) {
      current = current.fields[key]
    } else if (current.type === 'array' && current.items) {
      current = current.items[Number(key)]
    } else {
      return root
    }
  }
  if (current.type !== 'array' || !current.items) return root
  if (from < 0 || to < 0 || from >= current.items.length || to >= current.items.length || from === to) {
    return root
  }
  const item = current.items.splice(from, 1)[0]
  current.items.splice(to, 0, item)
  return copy
}

/**
 * Non-mutating duplication of the child at `path`. For an array index the copy
 * is inserted immediately after the original; for an object/group field the
 * copy is added under a new key suffixed with ` copy`.
 */
export function duplicateAt(root: ConfigValue, path: string[]): ConfigValue {
  const copy = deepClone(root)
  if (path.length === 0) return copy
  let current = copy
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if ((current.type === 'object' || current.type === 'group') && current.fields) {
      current = current.fields[key]
    } else if (current.type === 'array' && current.items) {
      current = current.items[Number(key)]
    }
  }
  const lastKey = path[path.length - 1]
  const childRef = (current.type === 'object' || current.type === 'group')
    ? current.fields?.[lastKey]
    : current.type === 'array' ? current.items?.[Number(lastKey)] : undefined
  if (!childRef) return copy

  const clone = deepClone(childRef)
  if ((current.type === 'object' || current.type === 'group') && current.fields) {
    let newKey = lastKey
    do { newKey = `${newKey} copy` } while (newKey in current.fields)
    current.fields[newKey] = clone
  } else if (current.type === 'array' && current.items) {
    const idx = Number(lastKey)
    current.items.splice(idx + 1, 0, clone)
  }
  return copy
}

/** Non-mutating removal of the field/index at `path` in a copy of `root`. */
export function deleteAt(root: ConfigValue, path: string[]): ConfigValue {
  const copy = deepClone(root)
  if (path.length === 0) return copy
  let current = copy
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if ((current.type === 'object' || current.type === 'group') && current.fields) {
      current = current.fields[key]
    } else if (current.type === 'array' && current.items) {
      current = current.items[Number(key)]
    }
  }
  const lastKey = path[path.length - 1]
  if ((current.type === 'object' || current.type === 'group') && current.fields) {
    delete current.fields[lastKey]
  } else if (current.type === 'array' && current.items) {
    current.items.splice(Number(lastKey), 1)
  }
  return copy
}
