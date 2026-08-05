use crate::imports::snbt::{SnbtValue, CommentedSnbt};
use crate::quest::ChapterImage;
use std::collections::HashMap;

pub(crate) fn ce(v: SnbtValue) -> CommentedSnbt { CommentedSnbt::new(v) }

pub(super) fn icon_to_snbt(icon: &str) -> SnbtValue {
    if icon.is_empty() {
        return SnbtValue::Compound(HashMap::new());
    }
    let mut icon_map = HashMap::new();
    icon_map.insert("id".to_string(), ce(SnbtValue::String(icon.to_string())));
    SnbtValue::Compound(icon_map)
}

pub(super) fn item_compound(item_id: &str, count: i32, smart_filter: &str) -> SnbtValue {
    // FTB Filter System smart filter: emit nested item Data Components form
    if !smart_filter.is_empty() {
        let mut components: HashMap<String, CommentedSnbt> = HashMap::new();
        components.insert("ftbfiltersystem:filter".to_string(), ce(SnbtValue::String(smart_filter.to_string())));
        let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
        m.insert("components".to_string(), ce(SnbtValue::Compound(components)));
        m.insert("count".to_string(), ce(SnbtValue::Int(count)));
        m.insert("id".to_string(), ce(SnbtValue::String("ftbfiltersystem:smart_filter".to_string())));
        return SnbtValue::Compound(m);
    }
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
    m.insert("id".to_string(), ce(SnbtValue::String(item_id.to_string())));
    if count > 1 {
        m.insert("count".to_string(), ce(SnbtValue::Int(count)));
    }
    SnbtValue::Compound(m)
}

/// Item value for a task/reward `item` field. Flat-chapter layouts use the
/// compound form; subdirs layouts use a plain string — except smart filters,
/// which must always keep the nested Data Components form.
pub(super) fn item_value(item_id: &str, count: i32, smart_filter: &str, flat_chapters: bool) -> SnbtValue {
    if !smart_filter.is_empty() {
        return item_compound(item_id, count, smart_filter);
    }
    if flat_chapters {
        item_compound(item_id, count, "")
    } else {
        SnbtValue::String(item_id.to_string())
    }
}

fn chapter_image_to_snbt(img: &ChapterImage) -> SnbtValue {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
    m.insert("image".to_string(), ce(SnbtValue::String(img.image.clone())));
    m.insert("x".to_string(), ce(SnbtValue::Double(img.x)));
    m.insert("y".to_string(), ce(SnbtValue::Double(img.y)));
    m.insert("width".to_string(), ce(SnbtValue::Double(img.width)));
    m.insert("height".to_string(), ce(SnbtValue::Double(img.height)));
    if img.rotation != 0.0 {
        m.insert("rotation".to_string(), ce(SnbtValue::Double(img.rotation)));
    }
    if img.scale != 1.0 {
        m.insert("scale".to_string(), ce(SnbtValue::Double(img.scale)));
    }
    if img.order != 0 {
        m.insert("order".to_string(), ce(SnbtValue::Int(img.order)));
    }
    if img.alpha != 255 {
        m.insert("alpha".to_string(), ce(SnbtValue::Int(img.alpha as i32)));
    }
    if img.color != 0 {
        m.insert("color".to_string(), ce(SnbtValue::Int(img.color)));
    }
    if !img.click.is_empty() {
        m.insert("click".to_string(), ce(SnbtValue::String(img.click.clone())));
    }
    if !img.hover.is_empty() {
        let hover: Vec<SnbtValue> = img.hover.iter().map(|h| SnbtValue::String(h.clone())).collect();
        m.insert("hover".to_string(), ce(SnbtValue::List(hover)));
    }
    SnbtValue::Compound(m)
}

pub(super) fn chapter_images_to_snbt(images: &[ChapterImage]) -> SnbtValue {
    SnbtValue::List(images.iter().map(chapter_image_to_snbt).collect())
}

// ─── Helpers ───────────────────────────────────────────────────────────────

pub(super) fn sanitize_filename(s: &str) -> String {
    s.chars().map(|c| {
        if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }
    }).collect::<String>().trim_matches('_').to_string()
}

pub(super) fn parse_hex_color(s: &str) -> Option<i32> {
    let s = s.trim_start_matches('#');
    if s.len() == 6 {
        u32::from_str_radix(s, 16).ok().map(|v| v as i32)
    } else {
        None
    }
}
