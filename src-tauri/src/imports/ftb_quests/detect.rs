use super::types::{FtBQuestsFormat, FtBQuestsLayout};
use std::path::Path;

/// Detect whether a quest directory uses SNBT or Json5 format
pub fn detect_format(quests_dir: &Path) -> FtBQuestsFormat {
    // Check for data.snbt (SNBT marker)
    if quests_dir.join("data.snbt").exists() {
        return FtBQuestsFormat::Snbt;
    }
    // Check for data.json5 (Json5 marker)
    if quests_dir.join("data.json5").exists() || quests_dir.join("data.json").exists() {
        return FtBQuestsFormat::Json5;
    }
    // Peek at first chapter file to detect format
    if let Ok(entries) = std::fs::read_dir(quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                // Check for chapter.snbt or chapter.json5 inside
                if p.join("chapter.snbt").exists() {
                    return FtBQuestsFormat::Snbt;
                }
                if p.join("chapter.json5").exists() || p.join("chapter.json").exists() {
                    return FtBQuestsFormat::Json5;
                }
            }
        }
    }
    // Default to SNBT (more common in the wild)
    FtBQuestsFormat::Snbt
}

/// Detect the directory layout used by this FTB Quests pack
pub fn detect_layout(quests_dir: &Path) -> FtBQuestsLayout {
    // Check for subdirectory layout: quests_dir/<chapter_dir>/chapter.snbt
    if let Ok(entries) = std::fs::read_dir(quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && (p.join("chapter.snbt").exists() || p.join("chapter.json5").exists()) {
                return FtBQuestsLayout::Subdirs;
            }
        }
    }
    // Check for old flat layout: quests_dir/chapters/*.snbt
    let chapters_dir = quests_dir.join("chapters");
    if chapters_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |e| e == "snbt" || e == "json5" || e == "json") {
                    return FtBQuestsLayout::FlatChapters;
                }
            }
        }
    }
    // Check for very old flat layout: *.snbt directly in quests_dir
    if let Ok(entries) = std::fs::read_dir(quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |e| e == "snbt" || e == "json5" || e == "json") {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                if name != "data.snbt" && name != "data.json5" && name != "data.json"
                    && name != "chapter_groups.snbt" && name != "chapter_groups.json5" {
                    return FtBQuestsLayout::Flat;
                }
            }
        }
    }
    FtBQuestsLayout::Subdirs
}
