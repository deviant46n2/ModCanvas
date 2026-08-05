use super::super::types::SnbtMapHelper;
use crate::imports::snbt::{CommentedSnbt, SnbtValue, parse_snbt};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Locate the FTB Quests data directory within a pack
pub(super) fn find_quests_dir(pack_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        pack_dir.join("config").join("ftbquests").join("quests"),
        pack_dir.join("world").join("ftbquests"),
        pack_dir.join("ftbquests").join("quests"),
        pack_dir.join("ftbquests"),
    ];
    for c in &candidates {
        if c.exists() && c.is_dir() {
            return Some(c.clone());
        }
    }
    // Check if pack_dir itself contains data.snbt / data.json5
    if pack_dir.join("data.snbt").exists() || pack_dir.join("data.json5").exists() {
        return Some(pack_dir.to_path_buf());
    }
    None
}

/// Extract icon string from SNBT value (handles both string and compound forms)
pub(super) fn extract_icon_str(m: &SnbtValue) -> String {
    if let Some(s) = m.get_str("icon") {
        return s.to_string();
    }
    // Old format: icon is a compound { id: "...", components: {...} }
    if let Some(icon_val) = m.get("icon") {
        if let Some(icon_m) = icon_val.as_compound() {
            let id = icon_m.get_str("id").unwrap_or("").to_string();
            // ftbquests:custom_icon uses nested components for the actual texture
            if id == "ftbquests:custom_icon" {
                if let Some(components) = icon_m.get("components") {
                    if let Some(comp_m) = components.as_compound() {
                        // The actual item texture is stored under "ftbquests:icon"
                        // It can be a string like "ae2:block/cell_workbench_top"
                        // or a compound like { id: "minecraft:diamond" }
                        if let Some(icon_ref) = comp_m.get_str("ftbquests:icon") {
                            let resolved = resolve_ftbquests_icon(icon_ref);
                            if !resolved.is_empty() {
                                return resolved;
                            }
                        } else if let Some(icon_comp) = comp_m.get("ftbquests:icon") {
                            if let Some(icon_cm) = icon_comp.as_compound() {
                                if let Some(inner_id) = icon_cm.get_str("id") {
                                    return inner_id.to_string();
                                }
                            }
                        }
                    }
                }
                return id;
            }
            if !id.is_empty() {
                return id;
            }
            // Last resort: check for nested icon compound
            if let Some(nested) = icon_m.get("icon") {
                if let Some(nested_m) = nested.as_compound() {
                    if let Some(nested_id) = nested_m.get_str("id") {
                        return nested_id.to_string();
                    }
                }
            }
        }
    }
    String::new()
}

/// Resolve an FTB Quests icon reference (e.g. "ae2:block/cell_workbench_top") to an item/block ID
pub(super) fn resolve_ftbquests_icon(icon_ref: &str) -> String {
    // Handle bare paths without namespace (e.g. "diamond", "stone")
    if !icon_ref.contains(':') {
        return format!("minecraft:{}", icon_ref);
    }
    let parts: Vec<&str> = icon_ref.splitn(2, ':').collect();
    if parts.len() != 2 { return String::new(); }
    let namespace = parts[0];
    let raw_path = parts[1];
    // Strip common prefixes like "textures/item/" or "textures/block/"
    let clean = raw_path
        .strip_prefix("textures/item/").or_else(|| raw_path.strip_prefix("textures/block/"))
        .unwrap_or(raw_path)
        .strip_suffix(".png").unwrap_or(raw_path);
    // Determine if it's a block or item reference
    if clean.starts_with("block/") {
        format!("{}:{}", namespace, &clean[6..])
    } else if clean.starts_with("item/") {
        format!("{}:{}", namespace, &clean[5..])
    } else {
        format!("{}:{}", namespace, clean)
    }
}

/// Parse language files in quests/lang/ to extract chapter UUID → title mapping.
/// Titles resolved from the pack's language files.
#[derive(Default)]
pub(crate) struct LangTitles {
    /// `chapter.{uuid}.title` -> readable chapter title
    pub chapter: HashMap<String, String>,
    /// `chapter_group.{uuid}.title` -> readable group title
    pub chapter_group: HashMap<String, String>,
}

/// Scan `quests/lang/**` and collect both chapter and chapter-group titles.
/// `en_us` files are scanned first so they win over other locales.
pub fn parse_lang_titles(quests_dir: &Path) -> LangTitles {
    let mut titles = LangTitles::default();
    for (category, uuid, title) in collect_lang_title_entries(quests_dir) {
        let map = match category.as_str() {
            "chapter" => &mut titles.chapter,
            "chapter_group" => &mut titles.chapter_group,
            _ => continue,
        };
        map.entry(uuid).or_insert(title);
    }
    titles
}

/// Language files use keys like `chapter.{uuid}.title`.
pub fn parse_chapter_titles(quests_dir: &Path) -> HashMap<String, String> {
    parse_lang_titles(quests_dir).chapter
}

/// Language files use keys like `chapter_group.{uuid}.title` for groups.
pub fn parse_group_titles(quests_dir: &Path) -> HashMap<String, String> {
    parse_lang_titles(quests_dir).chapter_group
}

fn collect_lang_title_entries(quests_dir: &Path) -> Vec<(String, String, String)> {
    let lang_dir = quests_dir.join("lang");
    let mut entries: Vec<(String, String, String)> = Vec::new();

    fn collect_lang_files(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_lang_files(&path, files)?;
                } else if path.extension().map_or(false, |ext| ext == "snbt") {
                    files.push(path);
                }
            }
        }
        Ok(())
    }

    let mut lang_files: Vec<PathBuf> = Vec::new();
    let _ = collect_lang_files(&lang_dir, &mut lang_files);

    // Prefer en_us first, then any other language - check if path contains "en_us"
    lang_files.sort_by_key(|p| {
        let path_str = p.to_string_lossy().to_string();
        if path_str.contains("/en_us/") || path_str.contains("\\en_us\\") { 0 } else { 1 }
    });

    for lang_file in lang_files {
        if let Ok(content) = std::fs::read_to_string(&lang_file) {
            if let Ok(ref snbt) = parse_snbt(&content) {
                if let Some(compound) = snbt.as_compound() {
                    for (key, val) in compound {
                        let Some(title) = val.as_str() else { continue };
                        for prefix in ["chapter.", "chapter_group."] {
                            if let Some(uuid) = key.strip_prefix(prefix).and_then(|k| k.strip_suffix(".title")) {
                                entries.push((
                                    prefix.trim_end_matches('.').to_string(),
                                    uuid.to_string(),
                                    title.to_string(),
                                ));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    entries
}

/// Format an item ID like "minecraft:diamond" or "allthemodium:allthemodium_ingot"
/// into a human-readable title.
pub(super) fn format_item_title(item_id: &str) -> String {
    let path = item_id.split(':').nth(1).unwrap_or(item_id);
    path.replace('_', " ")
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            chars.next().map(|c| c.to_uppercase().to_string() + chars.as_str()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parse description from SNBT (can be string or list of strings)
pub(super) fn parse_description(m: &SnbtValue) -> String {
    if let Some(desc) = m.get("description") {
        match desc {
            SnbtValue::String(s) => s.clone(),
            SnbtValue::List(items) => {
                let lines: Vec<String> = items.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                lines.join("\n")
            }
            _ => String::new(),
        }
    } else { String::new() }
}

/// Format a Minecraft color integer (like 16777215 = 0xFFFFFF) to hex string
fn parse_color_int(v: i64) -> String {
    if v < 0 { return String::new(); }
    format!("#{:06x}", v as u32)
}

pub(super) fn format_color(v: i64) -> String {
    parse_color_int(v)
}

/// Parse item from task compound - handles both old and new formats, plus 1.20.5+ Data Components
pub(super) fn parse_item_task(m: &SnbtValue) -> (String, i32) {
    let count = m.get_i64("count").unwrap_or(1) as i32;

    // 1.20.5+ Data Components format: item { id = "minecraft:diamond", components = {...} }
    if let Some(item_m) = m.get("item").and_then(|v| v.as_compound()) {
        let id = item_m.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let inner_count = item_m.get("count").and_then(|v| v.as_i64()).unwrap_or(count as i64) as i32;
        // Store components in NBT data if present
        if item_m.get("components").is_some() {
            // Will be handled by caller
        }
        return (id, inner_count);
    }

    // New format: item = "minecraft:oak_log" (string)
    if let Some(item_str) = m.get_str("item") {
        return (item_str.to_string(), count);
    }

    // Tag-based: tag = "forge:ingots/iron"
    if let Some(tag) = m.get_str("tag") {
        return (format!("#{}", tag), count);
    }

    (String::new(), count)
}

/// Extract the FTB Filter System smart filter DSL from a task/reward compound.
/// The DSL lives in nested 1.20.5+ Data Components, e.g.
/// `item: { components: { "ftbfiltersystem:filter": "or(item(...)item(...))" }, count: 1, id: "ftbfiltersystem:smart_filter" }`
pub(super) fn extract_smart_filter(m: &SnbtValue) -> String {
    fn extract(components: &HashMap<String, CommentedSnbt>) -> Option<&str> {
        components.get("ftbfiltersystem:filter").and_then(|c| c.value.as_str())
    }

    if let Some(item_m) = m.get("item").and_then(|v| v.as_compound()) {
        if let Some(components) = item_m.get("components").and_then(|v| v.as_compound()) {
            if let Some(dsl) = extract(components) {
                return dsl.to_string();
            }
        }
    }

    if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
        if let Some(dsl) = extract(components) {
            return dsl.to_string();
        }
    }

    String::new()
}
