/**
 * Parser for FTB Filter System smart filter DSL strings.
 *
 * The DSL is stored in quest SNBT files inside nested Data Components, e.g.
 * `item: { components: { "ftbfiltersystem:filter": "or(item(a:b)item(c:d))" } }`.
 * Grammar observed in the wild:
 *   - leaves:  `item(ns:path)`, `item_tag(ns:tag)`, bare `tag(ns:tag)`, `mod(ns)`
 *   - contextual leaves: `component(fuzzy:{...})`, `block(ns:path)`, `stack_size(N)`
 *     — parsed and preserved but never used as icon candidates
 *   - wrappers: `or(...)`, `and(...)`, `xor(...)`, `not(...)`
 *   - optional `ftbfiltersystem:` prefix on any call, e.g. `ftbfiltersystem:item_tag(...)`
 *   - members are whitespace-separated top-level calls, e.g.
 *     `item_tag(roots:crops)not(or(item(roots:wildroot)item(roots:wildewheet)))`
 *
 * Semantics (matching FTB Filter System's `FilterParser`): the DSL string is the
 * serialization of a filter hierarchy whose Root is an implicit "All Of"
 * (AND) compound. `or` = Any Of, `and` = All Of, `not` = None Of (single
 * child), and `only_one` (older dumps write `xor`) = Exactly One Of. This
 * matters for icon parity: in-game the quest icon cycles through every item
 * that *matches* the filter (evaluated over the creative search tab), not
 * through a flat union of the DSL's leaf members.
 */

export type SmartFilterMember =
  | { type: 'item'; id: string }
  | { type: 'tag'; tag: string }
  | { type: 'mod'; mod: string }
  | { type: 'filter'; name: string; args: string }

export type SmartFilterNode =
  | SmartFilterMember
  | { type: 'or'; children: SmartFilterNode[] }
  | { type: 'and'; children: SmartFilterNode[] }
  | { type: 'xor'; children: SmartFilterNode[] }
  | { type: 'not'; children: SmartFilterNode[] }

const CALL_NAME_RE = /^[A-Za-z0-9_:.]+/
// `only_one` is the compound FFS serializes for "Exactly One Of"; older dumps
// wrote `xor`. Both parse to the same node type so the matcher treats them
// identically.
const KNOWN_OPS = new Set(['item', 'item_tag', 'tag', 'mod', 'or', 'and', 'xor', 'not', 'only_one'])
/** Non-item Filter System calls that describe the filter but have no single
 * representative texture of their own. */
const FILTER_CALLS = new Set(['component', 'block', 'stack_size'])

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
  if (name === 'item') return { type: 'item', id: inner.trim() }
  if (name === 'item_tag' || name === 'tag') return { type: 'tag', tag: inner.trim() }
  if (name === 'mod') return { type: 'mod', mod: inner.trim() }
  if (FILTER_CALLS.has(name)) {
    return { type: 'filter', name, args: inner.trim() }
  }
  if (!KNOWN_OPS.has(name)) return null

  const children = scanCalls(inner)
    .map(parseSmartFilterCall)
    .filter((n): n is SmartFilterNode => n !== null)
  if (name === 'and') {
    return { type: 'and', children }
  }
  if (name === 'or') {
    return { type: 'or', children }
  }
  if (name === 'xor' || name === 'only_one') {
    return { type: 'xor', children }
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
    case 'filter':
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
    case 'filter':
      return `${member.name}:${member.args}`
  }
}

/**
 * Lookups needed to evaluate a filter DSL against an item id. Mirrors the data
 * FTB Filter System has at runtime: tag → item membership and an item's mod id.
 */
export interface SmartFilterMatchContext {
  /** Resolved item ids for a tag, or `undefined` when the tag is not loaded. */
  tagItems(tag: string): string[] | undefined
  /** Mod id for an item, or `undefined` when the item is unknown. */
  modOf(id: string): string | undefined
}

/** Evaluate a single parsed node against an item id. Compound filters follow
 * FTB Filter System semantics: `and`/root = all children, `or` = any child,
 * `xor`/`only_one` = exactly one child, `not` = none of the children.
 * `component`/`block`/`stack_size` leaves narrow a match without contributing
 * their own items, so they are treated as satisfied (never dropping an item
 * that the rest of the filter would accept). */
export function smartFilterNodeMatches(
  node: SmartFilterNode,
  id: string,
  ctx: SmartFilterMatchContext,
): boolean {
  switch (node.type) {
    case 'item':
      return node.id === id
    case 'tag': {
      const items = ctx.tagItems(node.tag)
      return !!items && items.includes(id)
    }
    case 'mod':
      return ctx.modOf(id) === node.mod
    case 'and':
      return node.children.length > 0 && node.children.every((c) => smartFilterNodeMatches(c, id, ctx))
    case 'or':
      return node.children.length > 0 && node.children.some((c) => smartFilterNodeMatches(c, id, ctx))
    case 'xor':
      return node.children.filter((c) => smartFilterNodeMatches(c, id, ctx)).length === 1
    case 'not':
      return node.children.length > 0 && node.children.every((c) => !smartFilterNodeMatches(c, id, ctx))
    case 'filter':
      return true
  }
}

/**
 * Does an item match the whole filter DSL? The DSL string is an implicit AND of
 * its top-level calls (FFS parses it into a RootFilter, an "All Of" compound),
 * so every top-level call must be satisfied.
 */
export function smartFilterMatches(
  dsl: string,
  id: string,
  ctx: SmartFilterMatchContext,
): boolean {
  const nodes = parseSmartFilterDsl(dsl)
  if (nodes.length === 0) return false
  return nodes.every((n) => smartFilterNodeMatches(n, id, ctx))
}

/**
 * All item ids from `registry` that satisfy the filter — the analog of FTB's
 * `DisplayStacksCache` (creative search tab ∩ filter matcher), which is what
 * the in-game quest icon animates through. Registry order is preserved
 * (roughly creative-tab order in-game).
 */
export function matchingSmartFilterItems(
  dsl: string,
  registry: string[],
  ctx: SmartFilterMatchContext,
): string[] {
  if (!dsl || !dsl.trim()) return []
  const out: string[] = []
  for (const id of registry) {
    if (smartFilterMatches(dsl, id, ctx)) out.push(id)
  }
  return out
}
