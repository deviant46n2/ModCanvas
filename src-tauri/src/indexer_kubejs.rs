// Best-effort reader for KubeJS item registrations. KubeJS packs register items
// in startup (and occasionally server) scripts via two APIs:
//   KubeJS 6: onEvent('item.registry', event => { event.create('id') ... })
//   KubeJS 7: StartupEvents.registry('item', event => { event.create('id') ... })
// Both `event.create('id')` and `event.register('id')` are recovered along with
// chained `.displayName('…')` / `.texture('ns:path')` modifiers. Tolerant by
// design: unparseable scripts yield nothing instead of failing the whole scan.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// A single item registration recovered from a KubeJS script.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubejsItemRegistration {
    /// Item id as written in the script (may be bare, e.g. `copper_ingot`).
    pub id: String,
    pub display_name: Option<String>,
    /// `.texture('ns:path')` ref (may be bare, e.g. `item/copper_ingot`).
    pub texture: Option<String>,
}

/// Metadata fingerprint for one KubeJS script, used to invalidate the item
/// index cache when a script adds/removes/edits item registrations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubejsScriptMeta {
    pub path: String,
    pub size: u64,
    pub modified: u64,
}

/// Collect fingerprints for every `*.js` under the KubeJS startup + server
/// script dirs (the two places item registrations can live).
pub fn collect_kubejs_scripts(instance_path: &Path) -> Vec<(PathBuf, KubejsScriptMeta)> {
    let mut out = Vec::new();
    for rel in ["startup_scripts", "server_scripts"] {
        let dir = instance_path.join("kubejs").join(rel);
        if !dir.exists() {
            continue;
        }
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() || path.extension().map_or(false, |e| e != "js") {
                continue;
            }
            if let Ok(meta) = std::fs::metadata(path) {
                out.push((
                    path.to_path_buf(),
                    KubejsScriptMeta {
                        path: path.to_string_lossy().replace('\\', "/"),
                        size: meta.len(),
                        modified: meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                    },
                ));
            }
        }
    }
    out.sort_by(|a, b| a.1.path.cmp(&b.1.path));
    out
}

/// Parse every item registration out of a KubeJS script body.
pub fn parse_kubejs_item_registrations(content: &str) -> Vec<KubejsItemRegistration> {
    let mut out = Vec::new();
    // Registry blocks: `onEvent('item.registry', …)` or `*.registry('item', …)`.
    let registry_re = Regex::new(
        r#"(?:onEvent\s*\(\s*['"]item\.registry['"]|[A-Za-z_]\w*Events\.registry\s*\(\s*['"]item['"])"#,
    )
    .unwrap();
    let mut pos = 0;
    while let Some(m) = registry_re.find_at(content, pos) {
        // The match ends inside the registry call's parens (after the `'item'`
        // literal), so the balance scan starts at depth 1.
        let Some(end) = find_balanced(content, m.end(), 1) else { break };
        let block = &content[m.start()..end];
        out.extend(parse_item_calls(block));
        pos = end;
    }
    out
}

/// Find the index just past the closing paren of a call that is already
/// `initial_depth` parens deep at `from`. String-literal aware, so a `)` inside
/// a string does not miscount.
fn find_balanced(s: &str, from: usize, initial_depth: usize) -> Option<usize> {
    let mut depth = initial_depth;
    let mut in_str = false;
    let mut escaped = false;
    for (i, ch) in s.char_indices() {
        if i < from {
            continue;
        }
        if in_str {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' || ch == '\'' {
                in_str = false;
            }
            continue;
        }
        match ch {
            '"' | '\'' => in_str = true,
            '(' => depth += 1,
            ')' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_item_calls(block: &str) -> Vec<KubejsItemRegistration> {
    let mut out = Vec::new();
    let call_re = Regex::new(r"event\.(create|register)\s*\(").unwrap();
    let mut pos = 0;
    while let Some(m) = call_re.find_at(block, pos) {
        // `m.end()` is right after `event.create(` — the args begin there.
        let args_start = m.end();
        let Some(end) = find_balanced(block, args_start, 0) else {
            break;
        };
        let args = &block[args_start..end];
        let Some(raw_id) = first_string_literal(args) else {
            pos = end;
            continue;
        };
        let id = raw_id.trim().to_string();
        if id.is_empty() {
            pos = end;
            continue;
        }
        // Chained modifiers run from this call to the next registration.
        let tail_end = call_re
            .find_at(block, end)
            .map(|nm| nm.start())
            .unwrap_or(block.len());
        let tail = &block[end..tail_end];
        out.push(KubejsItemRegistration {
            id,
            display_name: capture_string(tail, "displayName"),
            texture: capture_string(tail, "texture"),
        });
        pos = end;
    }
    out
}

fn first_string_literal(s: &str) -> Option<String> {
    let re = Regex::new(r#"['"]([^'"]+)['"]"#).unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

/// Capture the first string argument of a chained `.key('…')` call.
fn capture_string(s: &str, key: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"\.{key}\s*\(\s*['"]([^'"]+)['"]\s*\)"#)).unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_new_registry_api() {
        let script = r#"
StartupEvents.registry('item', event => {
  event.create('test_item').displayName('Test Item').texture('mod:item/test_item')
  event.create('second').displayName('Second')
})
"#;
        let regs = parse_kubejs_item_registrations(script);
        assert_eq!(regs.len(), 2);
        assert_eq!(regs[0].id, "test_item");
        assert_eq!(regs[0].display_name.as_deref(), Some("Test Item"));
        assert_eq!(regs[0].texture.as_deref(), Some("mod:item/test_item"));
        assert_eq!(regs[1].id, "second");
        assert_eq!(regs[1].display_name.as_deref(), Some("Second"));
        assert!(regs[1].texture.is_none());
    }

    #[test]
    fn reads_old_registry_api() {
        let script = r#"
onEvent('item.registry', event => {
  event.register('copper_ingot', builder => builder.displayName('Copper Ingot'))
  event.create('iron_ingot').texture('item/iron_ingot')
})
"#;
        let regs = parse_kubejs_item_registrations(script);
        assert_eq!(regs.len(), 2);
        assert_eq!(regs[0].id, "copper_ingot");
        assert_eq!(regs[1].id, "iron_ingot");
        assert_eq!(regs[1].texture.as_deref(), Some("item/iron_ingot"));
    }

    #[test]
    fn handles_namespaced_and_string_parenthesized_ids() {
        let script = r#"StartupEvents.registry('item', event => { event.create('mymod:widget').displayName('Widget') })"#;
        let regs = parse_kubejs_item_registrations(script);
        assert_eq!(regs.len(), 1);
        assert_eq!(regs[0].id, "mymod:widget");
    }

    #[test]
    fn ignores_non_item_scripts() {
        let script = r#"
ServerEvents.recipes(event => { event.shaped('minecraft:diamond', ['A'], { A: 'minecraft:diamond' }) })
console.log('no items here')
"#;
        assert!(parse_kubejs_item_registrations(script).is_empty());
    }

    #[test]
    fn collects_script_metas() {
        let dir = tempfile::tempdir().unwrap();
        let startup = dir.path().join("kubejs").join("startup_scripts");
        std::fs::create_dir_all(&startup).unwrap();
        std::fs::write(startup.join("a.js"), "// x").unwrap();
        let metas = collect_kubejs_scripts(dir.path());
        assert_eq!(metas.len(), 1);
        assert!(metas[0].1.path.ends_with("startup_scripts/a.js"));
        assert_eq!(metas[0].1.size, 4);
    }
}
