/**
 * Parser for FTB Filter System smart filter DSL strings.
 *
 * The DSL is stored in quest SNBT files inside nested Data Components, e.g.
 * `item: { components: { "ftbfiltersystem:filter": "or(item(a:b)item(c:d))" } }`.
 * Grammar observed in the wild:
 *   - leaves:  `item(ns:path)`, `item_tag(ns:tag)`, bare `tag(ns:tag)`, `mod(ns)`
 *   - wrappers: `or(...)`, `and(...)`, `xor(...)`, `not(...)`
 *   - optional `ftbfiltersystem:` prefix on any call, e.g. `ftbfiltersystem:item_tag(...)`
 *   - members are whitespace-separated top-level calls, e.g.
 *     `item_tag(roots:crops)not(or(item(roots:wildroot)item(roots:wildewheet)))`
 */

export type SmartFilterMember =
  | { type: 'item'; id: string }
  | { type: 'tag'; tag: string }
  | { type: 'mod'; mod: string }

export type SmartFilterNode =
  | SmartFilterMember
  | { type: 'or'; children: SmartFilterNode[] }
  | { type: 'and'; children: SmartFilterNode[] }
  | { type: 'xor'; children: SmartFilterNode[] }
  | { type: 'not'; children: SmartFilterNode[] }

const CALL_NAME_RE = /^[A-Za-z0-9_:.]+/
const KNOWN_OPS = new Set(['item', 'item_tag', 'tag', 'mod', 'or', 'and', 'xor', 'not'])

/** Scan a DSL string into a list of balanced top-level calls. */
export function scanCalls(src: string): string[] {
  const calls: string[] = []
  let i = 0
  const len = src.length
  while (i < len) {
    if (/\s/.test(src[i])) {
      i++
      continue
    }
    const nameStart = i
    const nameMatch = CALL_NAME_RE.exec(src.slice(i))
    if (!nameMatch) {
      i++
      continue
    }
    i += nameMatch[0].length
    let k = i
    while (k < len && /\s/.test(src[k])) k++
    if (src[k] !== '(') continue
    let depth = 0
    let m = k
    for (; m < len; m++) {
      if (src[m] === '(') depth++
      else if (src[m] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    if (m >= len) break
    calls.push(src.slice(nameStart, m + 1))
    i = m + 1
  }
  return calls
}

function baseName(name: string): string {
  return name.includes(':') ? name.split(':').slice(1).join(':') : name
}

export function parseSmartFilterCall(call: string): SmartFilterNode | null {
  const nameMatch = /^([A-Za-z0-9_:.]+)\(([\s\S]*)\)$/.exec(call.trim())
  if (!nameMatch) return null
  const raw = nameMatch[1]
  const inner = nameMatch[2]
  const name = baseName(raw)
  if (!KNOWN_OPS.has(name)) return null

  if (name === 'item') return { type: 'item', id: inner.trim() }
  if (name === 'item_tag' || name === 'tag') return { type: 'tag', tag: inner.trim() }
  if (name === 'mod') return { type: 'mod', mod: inner.trim() }

  const children = scanCalls(inner)
    .map(parseSmartFilterCall)
    .filter((n): n is SmartFilterNode => n !== null)
  if (name === 'or' || name === 'and' || name === 'xor') {
    return { type: name, children }
  }
  if (name === 'not') {
    return { type: 'not', children }
  }
  return null
}

export function parseSmartFilterDsl(dsl: string): SmartFilterNode[] {
  return scanCalls(dsl)
    .map(parseSmartFilterCall)
    .filter((n): n is SmartFilterNode => n !== null)
}

function flattenNode(node: SmartFilterNode, out: SmartFilterMember[]): void {
  switch (node.type) {
    case 'item':
    case 'tag':
    case 'mod':
      out.push(node)
      break
    case 'or':
    case 'and':
    case 'xor':
      for (const child of node.children) flattenNode(child, out)
      break
    case 'not':
      // Excluded members — never shown as filter alternatives.
      break
  }
}

/**
 * Flatten a DSL string into the icon candidates that visually represent the
 * filter. `not(...)` subtrees are excluded (they narrow the filter rather than
 * adding alternatives). Result preserves the DSL order and is de-duplicated.
 */
export function smartFilterMembers(dsl: string): SmartFilterMember[] {
  const out: SmartFilterMember[] = []
  const seen = new Set<string>()
  for (const node of parseSmartFilterDsl(dsl)) {
    const before = out.length
    flattenNode(node, out)
    for (let i = before; i < out.length; i++) {
      const key = memberKey(out[i])
      if (seen.has(key)) {
        out.splice(i, 1)
        i--
      } else {
        seen.add(key)
      }
    }
  }
  return out
}

/** Canonical texture-index key for a member. `item` maps directly; tags and
 * mods are prefixed so they never collide with real item keys. */
export function memberKey(member: SmartFilterMember): string {
  switch (member.type) {
    case 'item':
      return member.id
    case 'tag':
      return `#${member.tag}`
    case 'mod':
      return `mod:${member.mod}`
  }
}
