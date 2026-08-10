use std::collections::HashMap;

use super::value::{CommentedSnbt, SnbtValue};

impl SnbtValue {
    /// Serialize this value to FTB-compatible SNBT string
    pub fn to_snbt_string(&self) -> String {
        self.to_snbt_pretty(0)
    }

    fn needs_quoting(s: &str) -> bool {
        if s.is_empty() { return true; }
        let mut chars = s.chars();
        let first = chars.next().unwrap();
        // First char must be one the tokenizer's identifier path handles
        // unambiguously: letter or '_'. A digit-first key routes to
        // read_number_or_id, which can mis-split it ("123abc" -> Number("123")
        // + Identifier("abc")) — quote it instead. ('-'/'.'/'+' first chars are
        // kept unquoted: '-' reads via read_number_or_id and '.'/'+' are valid
        // unquoted identifier starts for the tokenizer.)
        if !first.is_alphabetic() && first != '_' && first != '-' && first != '.' && first != '+' {
            return true;
        }
        for ch in chars {
            // Must match what the tokenizer's unquoted-identifier read accepts
            // (alphanumeric / _ / - / .): a body containing '+' or '/' passes
            // here unquoted but the tokenizer splits at it and silently drops
            // the tail (proptest-found, s23). Quote them instead.
            if !ch.is_alphanumeric() && ch != '_' && ch != '-' && ch != '.' {
                return true;
            }
        }
        // Keys containing a colon (namespaced, e.g. "ftbfiltersystem:filter") must be
        // quoted: the tokenizer splits unquoted keys at ':' so they would not round-trip.
        if s.contains(':') { return true; }
        // Check for reserved words
        matches!(s, "true" | "false" | "NaN" | "Infinity" | "-Infinity")
    }

    fn quote_string(s: &str) -> String {
        // Use double quotes, escape internal quotes and backslashes
        let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{}\"", escaped)
    }

    fn to_snbt_pretty(&self, indent: usize) -> String {
        match self {
            SnbtValue::Byte(v) => format!("{}b", v),
            SnbtValue::Short(v) => format!("{}s", v),
            SnbtValue::Int(v) => v.to_string(),
            SnbtValue::Long(v) => format!("{}L", v),
            SnbtValue::Float(v) => {
                // f32 Display emits integral values with no '.' (e.g. 9.3e18 ->
                // "9300000000000000000"), so the parser's integer path takes
                // over and overflows on |v| >= 2^63 — the serializer emitting
                // output its own parser cannot read (proptest, s23). The ".0f"
                // forces the float path, exactly like the f64 ".0d" case below.
                // It also preserves -0.0 (Display "-0" would parse as +0.0).
                if v.fract() == 0.0 && v.is_finite() {
                    format!("{}.0f", v)
                } else {
                    format!("{}f", v)
                }
            }
            SnbtValue::Double(v) => {
                if v.fract() == 0.0 && v.is_finite() {
                    format!("{}.0d", v)
                } else {
                    format!("{}d", v)
                }
            }
            SnbtValue::String(s) => Self::quote_string(s),
            SnbtValue::ByteArray(arr) => {
                let items: Vec<String> = arr.iter().map(|b| format!("{}b", b)).collect();
                format!("[B; {}]", items.join(", "))
            }
            SnbtValue::IntArray(arr) => {
                let items: Vec<String> = arr.iter().map(|i| i.to_string()).collect();
                format!("[I; {}]", items.join(", "))
            }
            SnbtValue::LongArray(arr) => {
                let items: Vec<String> = arr.iter().map(|l| format!("{}L", l)).collect();
                format!("[L; {}]", items.join(", "))
            }
            SnbtValue::List(items) => {
                if items.is_empty() {
                    return "[]".to_string();
                }
                // If all items are simple (scalars or short strings), use inline
                let all_simple = items.iter().all(|v| matches!(v,
                    SnbtValue::Byte(_) | SnbtValue::Short(_) | SnbtValue::Int(_) |
                    SnbtValue::Long(_) | SnbtValue::Float(_) | SnbtValue::Double(_) |
                    SnbtValue::String(_)
                ));
                if all_simple && items.len() <= 8 {
                    let inner: Vec<String> = items.iter().map(|v| v.to_snbt_pretty(indent)).collect();
                    return format!("[ {} ]", inner.join(", "));
                }
                // Multiline list
                let pad = " ".repeat(indent + 2);
                let inner: Vec<String> = items.iter()
                    .map(|v| format!("{}{}", pad, v.to_snbt_pretty(indent + 2)))
                    .collect();
                format!("[\n{}\n{}]", inner.join("\n"), " ".repeat(indent))
            }
            SnbtValue::Compound(map) => {
                if map.is_empty() {
                    return "{}".to_string();
                }
                let pad = " ".repeat(indent + 2);
                let mut entries: Vec<(&String, &CommentedSnbt)> = map.iter().collect();
                entries.sort_by(|a, b| a.0.cmp(b.0));
                let inner: Vec<String> = entries.iter()
                    .map(|(k, commented)| {
                        let key = if Self::needs_quoting(k) { Self::quote_string(k) } else { (*k).clone() };
                        let mut lines = Vec::new();
                        // Emit leading comments
                        for c in &commented.leading_comments {
                            lines.push(format!("{}{}", pad, c));
                        }
                        let val_str = commented.value.to_snbt_pretty(indent + 2);
                        lines.push(format!("{}{}: {}", pad, key, val_str));
                        // Emit trailing comment
                        if let Some(ref tc) = commented.trailing_comment {
                            lines.push(format!("  {}", tc));
                        }
                        lines.join("\n")
                    })
                    .collect();
                format!("{{\n{}\n{}}}", inner.join("\n"), " ".repeat(indent))
            }
        }
    }
}

/// Serialize a HashMap to SNBT string (for chapter/quest files)
pub fn compound_to_snbt(map: &HashMap<String, CommentedSnbt>) -> String {
    let val = SnbtValue::Compound(map.clone());
    val.to_snbt_string()
}
