// FTB theme color utilities. The game's theme files (ftb_quests_theme.txt)
// write colors as `#AARRGGBB` hex. Per FTB Library ImageIcon (v2101.1.35),
// the `color=` option is a VERTEX TINT on the texture draw — the RGB
// multiplies the texture's pixels and the alpha modulates its opacity. The
// default (and all real pack cases we've seen) use a white tint, so RGB is
// identity and only the alpha fraction matters for CSS rendering. Pure and
// testable.

/** Extract the alpha fraction (0..1) from an FTB `#AARRGGBB` color.
 *  Returns null for anything that isn't an 8-digit # hex. */
export function argbAlpha(hex: string): number | null {
  const m = /^#([0-9a-fA-F]{8})$/.exec(hex.trim())
  if (!m) return null
  const val = parseInt(m[1], 16)
  return ((val >>> 24) & 0xff) / 255
}