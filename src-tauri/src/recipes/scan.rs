// Comment-aware scanning helpers shared by the KubeJS and CraftTweaker recipe
// parsers. Builds a set of "opaque" byte regions (string literals, `//` line
// comments, `/* */` block comments) that recipe-call regexes must never match
// inside, and a line index for computing 1-based line spans.

/// Byte ranges of source that recipe-call matchers must not match inside:
/// string literals, `//` line comments, and `/* */` block comments.
pub struct OpaqueRegions {
    regions: Vec<(usize, usize)>,
}

impl OpaqueRegions {
    /// Scan `src`, treating each `(opener, closer)` pair in `quotes` as a
    /// string delimiter (with backslash escaping), `//` as a line comment, and
    /// `/* */` as a block comment. Regions are emitted in source order and
    /// never overlap.
    ///
    /// KubeJS uses `('`, `"`, `` ` ``), CraftTweaker adds `('<', '>')` for its
    /// `<item:...>` / `<tag:items:...>` bracket literals.
    pub fn scan(src: &str, quotes: &[(char, char)]) -> OpaqueRegions {
        let bytes = src.as_bytes();
        let mut regions = Vec::new();
        let mut i = 0usize;
        while i < bytes.len() {
            let b = bytes[i];
            if let Some(&(_, close)) = quotes.iter().find(|&&(o, _)| o as u8 == b) {
                let start = i;
                i += 1;
                let close = close as u8;
                let mut escaped = false;
                while i < bytes.len() {
                    let c = bytes[i];
                    if escaped {
                        escaped = false;
                    } else if c == b'\\' {
                        escaped = true;
                    } else if c == close {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                regions.push((start, i));
                continue;
            }
            if b == b'/' && i + 1 < bytes.len() {
                let n = bytes[i + 1];
                if n == b'/' {
                    let start = i;
                    while i < bytes.len() && bytes[i] != b'\n' {
                        i += 1;
                    }
                    regions.push((start, i));
                    continue;
                }
                if n == b'*' {
                    let start = i;
                    i += 2;
                    while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                        i += 1;
                    }
                    i = (i + 2).min(bytes.len());
                    regions.push((start, i));
                    continue;
                }
            }
            i += 1;
        }
        OpaqueRegions { regions }
    }

    /// True when the byte range `[start, end)` overlaps any opaque region.
    pub fn overlaps(&self, start: usize, end: usize) -> bool {
        for &(rs, re) in &self.regions {
            if re <= start {
                continue;
            }
            return rs < end;
        }
        false
    }

    /// Byte index just past the first opaque region that extends past `pos`,
    /// used to skip a regex match that landed inside a comment/string.
    pub fn advance_past(&self, pos: usize) -> Option<usize> {
        self.regions
            .iter()
            .find(|&&(_, re)| re > pos)
            .map(|&(_, re)| re)
    }

    /// Exposed for diagnostics/tests.
    pub fn regions(&self) -> &[(usize, usize)] {
        &self.regions
    }
}

/// Byte offset where each 0-based line begins (line 0 is always offset 0).
pub fn line_starts(src: &str) -> Vec<usize> {
    let mut starts = vec![0usize];
    for (i, b) in src.bytes().enumerate() {
        if b == b'\n' {
            starts.push(i + 1);
        }
    }
    starts
}

/// 1-based line number containing the byte at index `byte`.
pub fn line_of(starts: &[usize], byte: usize) -> u32 {
    match starts.binary_search(&byte) {
        Ok(i) => i as u32 + 1,
        Err(i) => i as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_comments_and_strings() {
        let src = "const x = 'http://a';\n// event.shaped('x')\n/* block event.shaped */\nevent.shaped('a:b', ['A'], { A: 'c:d' })";
        let opaque = OpaqueRegions::scan(src, &[('\'', '\''), ('"', '"'), ('`', '`')]);
        assert!(opaque.overlaps(src.find("http").unwrap(), src.find("http").unwrap() + 1));
        let com = src.find("// event").unwrap();
        assert!(opaque.overlaps(com, com + 1));
        let blk = src.find("/* block").unwrap();
        assert!(opaque.overlaps(blk, blk + 1));
        let call = src.find("event.shaped('a:b'").unwrap();
        assert!(!opaque.overlaps(call, call + 1));
    }

    #[test]
    fn advance_past_skips_comment_tail() {
        let src = "// event.shaped('x')\nevent.shaped('a:b', ['A'], { A: 'c:d' })";
        let opaque = OpaqueRegions::scan(src, &[('\'', '\''), ('"', '"'), ('`', '`')]);
        let com = src.find("// event").unwrap();
        assert!(opaque.overlaps(com, com + 1));
        let next = opaque.advance_past(com).unwrap();
        assert_eq!(&src[next..], "\nevent.shaped('a:b', ['A'], { A: 'c:d' })");
    }

    #[test]
    fn bracket_literals_close_at_angle() {
        let src = "<item:minecraft:stick>, <item:minecraft:oak_planks>);";
        let opaque = OpaqueRegions::scan(src, &[('\'', '\''), ('"', '"'), ('<', '>')]);
        // Two separate bracket regions, the code between them stays visible.
        let first = src.find("<item:minecraft:stick>").unwrap();
        let second = src.find("<item:minecraft:oak_planks>").unwrap();
        assert!(opaque.overlaps(first, first + 1));
        assert!(opaque.overlaps(second, second + 1));
        let between = src.find(", ").unwrap();
        assert!(!opaque.overlaps(between, between + 1));
        assert_eq!(opaque.regions().len(), 2);
    }

    #[test]
    fn line_numbers_are_one_based() {
        let src = "a\nb\nc";
        let starts = line_starts(src);
        assert_eq!(line_of(&starts, 0), 1);
        assert_eq!(line_of(&starts, 2), 2);
        assert_eq!(line_of(&starts, 4), 3);
        // byte exactly on a line start belongs to the line after the newline
        assert_eq!(line_of(&starts, 2), 2);
    }
}
