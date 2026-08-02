use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Parse an FTB Quests theme file (assets/ftbquests/ftb_quests_theme.txt).
///
/// The format is a flat key: value list grouped into `[section]` blocks. The
/// special `[*]` section applies to every chapter. `background` (and other
/// icon properties) may carry `; prop=value` options, so we take only the
/// leading path token as the texture key.
pub fn parse_theme(text: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current = String::from("*");
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            current = line[1..line.len() - 1].trim().to_string();
            continue;
        }
        let Some(colon) = line.find(':') else {
            continue;
        };
        let key = line[..colon].trim().to_string();
        let value = line[colon + 1..].trim();
        if key.is_empty() || value.is_empty() {
            continue;
        }
        // Icons support trailing "; color=..., tile_size=..." options.
        let path = value.split(';').next().unwrap_or(value).trim().to_string();
        if path.starts_with("{{") {
            continue; // property reference, not a concrete path
        }
        sections.entry(current.clone()).or_default().insert(key, path);
    }
    sections
}

/// Read the FTB Quests theme for an instance. The pack can override the theme
/// via `kubejs/assets/ftbquests/ftb_quests_theme.txt`; otherwise the value
/// comes from the mod jar's bundled theme.
pub fn read_theme(instance_path: &Path) -> HashMap<String, HashMap<String, String>> {
    let kubejs = instance_path.join("kubejs").join("assets/ftbquests/ftb_quests_theme.txt");
    if let Ok(text) = fs::read_to_string(&kubejs) {
        return parse_theme(&text);
    }
    let jar = ftb_quests_jar(instance_path);
    match jar {
        Some(path) => match jar_theme_text(&path) {
            Some(text) => parse_theme(&text),
            None => HashMap::new(),
        },
        None => HashMap::new(),
    }
}

/// Resolve the `background` texture key for a chapter id (empty string means
/// the global `[*]` rule).
pub fn background_key_for(theme: &HashMap<String, HashMap<String, String>>, chapter_id: &str) -> Option<String> {
    let global = theme.get("*").and_then(|s| s.get("background")).cloned();
    if chapter_id.is_empty() {
        return global;
    }
    theme
        .get(chapter_id)
        .and_then(|s| s.get("background"))
        .cloned()
        .or(global)
}

fn ftb_quests_jar(instance_path: &Path) -> Option<std::path::PathBuf> {
    let mods_dir = instance_path.join("mods");
    for entry in fs::read_dir(&mods_dir).ok().into_iter().flatten().flatten() {
        let path = entry.path();
        let name = path.file_name()?.to_string_lossy().to_lowercase();
        if path.extension().map_or(false, |e| e == "jar") && name.starts_with("ftb-quests-") {
            return Some(path);
        }
    }
    None
}

fn jar_theme_text(jar_path: &Path) -> Option<String> {
    let file = fs::File::open(jar_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut entry = archive.by_name("assets/ftbquests/ftb_quests_theme.txt").ok()?;
    let mut buf = String::new();
    use std::io::Read;
    entry.read_to_string(&mut buf).ok()?;
    Some(buf)
}

#[tauri::command]
pub fn get_quest_theme_background(instance_path: String, chapter_id: String) -> Result<Option<String>, String> {
    let theme = read_theme(Path::new(&instance_path));
    Ok(background_key_for(&theme, &chapter_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
        [*]
        background: atm:textures/quest_assets/background.png; color=#DCFFFFFF
        # a comment line is ignored
        [chapter_abc]
        background: custom:textures/bg_abc.png
        [chapter_ref]
        background: {{some_ref}}
    "#;

    #[test]
    fn parse_theme_extracts_global_and_chapter_sections() {
        let theme = parse_theme(SAMPLE);
        let global = theme.get("*").expect("global section");
        assert_eq!(
            global.get("background").map(String::as_str),
            Some("atm:textures/quest_assets/background.png")
        );
        assert_eq!(
            theme.get("chapter_abc").and_then(|s| s.get("background")).map(String::as_str),
            Some("custom:textures/bg_abc.png")
        );
        // {{ref}} values and comments are dropped
        assert!(theme.get("chapter_ref").and_then(|s| s.get("background")).is_none());
    }

    #[test]
    fn background_key_resolves_chapter_then_global() {
        let theme = parse_theme(SAMPLE);
        assert_eq!(
            background_key_for(&theme, "chapter_abc"),
            Some("custom:textures/bg_abc.png".to_string())
        );
        // unknown chapter falls back to the global [*] rule
        assert_eq!(
            background_key_for(&theme, "missing"),
            Some("atm:textures/quest_assets/background.png".to_string())
        );
        // empty chapter id means global
        assert_eq!(
            background_key_for(&theme, ""),
            Some("atm:textures/quest_assets/background.png".to_string())
        );
    }
}
