use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// A resolved theme `background` property. The game draws the texture across
/// the whole screen rect; `tile_size` switches from stretch to a repeating
/// tile, and `color` (ARGB hex, e.g. `#DCFFFFFF`) is drawn as an overlay on
/// top (FTBQuestsTheme.drawGui → ThemeProperties.BACKGROUND, v2101.1.31).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeBackground {
    pub key: String,
    /// `#AARRGGBB` as written in the theme file.
    pub color: Option<String>,
    /// `tile_size` in px. None = stretch the texture to the full rect.
    pub tile_size: Option<u32>,
}

/// Parse an FTB Quests theme file (assets/ftbquests/ftb_quests_theme.txt).
///
/// The format is a flat key: value list grouped into `[section]` blocks. The
/// special `[*]` section applies to every chapter. Icon properties (like
/// `background`) carry the raw value INCLUDING `; prop=value` options — the
/// game's full semantics (stretch vs tile, color overlay) depend on them.
/// `{{ref}}` values are property references and are dropped.
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
        if value.starts_with("{{") {
            continue; // property reference, not a concrete path
        }
        sections.entry(current.clone()).or_default().insert(key, value.to_string());
    }
    sections
}

/// Split a `background` value into the texture key and its `; k=v` options.
/// `ftblibrary:textures/gui/background_squares.png; color=#DCFFFFFF; tile_size=64`
/// → key `ftblibrary:...`, color `#DCFFFFFF`, tile_size `64`.
pub fn parse_background_value(value: &str) -> Option<ThemeBackground> {
    let mut parts = value.split(';').map(str::trim);
    let key = parts.next()?.to_string();
    if key.is_empty() {
        return None;
    }
    let mut color = None;
    let mut tile_size = None;
    for part in parts {
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        match k.trim() {
            "color" => color = Some(v.trim().to_string()),
            "tile_size" => tile_size = v.trim().parse().ok(),
            _ => {}
        }
    }
    Some(ThemeBackground { key, color, tile_size })
}

/// Resolve the full `background` spec for a chapter id (empty string means
/// the global `[*]` rule). Chapter selector wins over global; the game's
/// `QuestTheme.get` falls back the same way (chapter → global → defaults).
pub fn background_for(theme: &HashMap<String, HashMap<String, String>>, chapter_id: &str) -> Option<ThemeBackground> {
    let global = theme.get("*").and_then(|s| s.get("background"));
    let value = if chapter_id.is_empty() {
        global
    } else {
        theme
            .get(chapter_id)
            .and_then(|s| s.get("background"))
            .or(global)
    }?;
    parse_background_value(value)
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

#[tauri::command]
pub fn get_quest_theme_background(instance_path: String, chapter_id: String) -> Result<Option<ThemeBackground>, String> {
    let theme = read_theme(Path::new(&instance_path));
    Ok(background_for(&theme, &chapter_id))
}

/// Read the game's `guiScale` from the instance's `options.txt`.
///
/// The game writes it as `guiScale:<n>`; 0 = auto (the game picks per window),
/// 1-4 = explicit. The editor uses it to scale its default chapter-open view
/// (canvas zoom + background tiles) so the tool matches the player's actual
/// game look. Absent file, absent key, auto (0) and out-of-range values all
/// resolve to 1 — the neutral raw look.
pub fn read_game_gui_scale(instance_path: &Path) -> u32 {
    let options = instance_path.join("minecraft").join("options.txt");
    let Ok(text) = fs::read_to_string(&options) else {
        return 1;
    };
    text.lines()
        .find_map(|line| line.strip_prefix("guiScale:"))
        .and_then(|v| v.trim().parse::<u32>().ok())
        .filter(|&s| (1..=4).contains(&s))
        .unwrap_or(1)
}

#[tauri::command]
pub fn get_game_gui_scale(instance_path: String) -> Result<u32, String> {
    Ok(read_game_gui_scale(Path::new(&instance_path)))
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
        // Raw value is kept WITH options — the game's tile/color semantics
        // live in the `; prop=value` tail.
        assert_eq!(
            global.get("background").map(String::as_str),
            Some("atm:textures/quest_assets/background.png; color=#DCFFFFFF")
        );
        assert_eq!(
            theme.get("chapter_abc").and_then(|s| s.get("background")).map(String::as_str),
            Some("custom:textures/bg_abc.png")
        );
        // {{ref}} values and comments are dropped
        assert!(theme.get("chapter_ref").and_then(|s| s.get("background")).is_none());
    }

    #[test]
    fn parse_background_value_extracts_key_color_and_tile_size() {
        let bg = parse_background_value(
            "ftblibrary:textures/gui/background_squares.png; color=#DCFFFFFF; tile_size=64",
        )
        .expect("parses");
        assert_eq!(bg.key, "ftblibrary:textures/gui/background_squares.png");
        assert_eq!(bg.color.as_deref(), Some("#DCFFFFFF"));
        assert_eq!(bg.tile_size, Some(64));
    }

    #[test]
    fn parse_background_value_without_options_stretches() {
        // No tile_size → the game stretches the texture to the screen rect
        // (the ATM10SKY case: a single 1920x1080 image, no tile_size).
        let bg = parse_background_value("atm:textures/quest_assets/background.png; color=#DCFFFFFF")
            .expect("parses");
        assert_eq!(bg.key, "atm:textures/quest_assets/background.png");
        assert_eq!(bg.color.as_deref(), Some("#DCFFFFFF"));
        assert_eq!(bg.tile_size, None);
        // bare path, no options at all
        let bare = parse_background_value("custom:textures/bg_abc.png").expect("parses");
        assert_eq!(bare.key, "custom:textures/bg_abc.png");
        assert_eq!(bare.color, None);
        assert_eq!(bare.tile_size, None);
    }

    #[test]
    fn background_for_resolves_chapter_then_global() {
        let theme = parse_theme(SAMPLE);
        // chapter override wins
        let chapter = background_for(&theme, "chapter_abc").expect("chapter background");
        assert_eq!(chapter.key, "custom:textures/bg_abc.png");
        // unknown chapter falls back to the global [*] rule, options intact
        let fallback = background_for(&theme, "missing").expect("global fallback");
        assert_eq!(fallback.key, "atm:textures/quest_assets/background.png");
        assert_eq!(fallback.color.as_deref(), Some("#DCFFFFFF"));
        // empty chapter id means global
        assert_eq!(
            background_for(&theme, "").map(|b| b.key).as_deref(),
            Some("atm:textures/quest_assets/background.png")
        );
        // {{ref}} values are dropped at parse → the section has no own
        // background → resolution falls back to the global rule (game behavior).
        assert!(theme.get("chapter_ref").and_then(|s| s.get("background")).is_none());
        assert_eq!(
            background_for(&theme, "chapter_ref").map(|b| b.key).as_deref(),
            Some("atm:textures/quest_assets/background.png")
        );
    }

    #[test]
    fn parse_theme_handles_default_theme_file() {
        // The shipped default theme (ftb_quests_theme.txt) uses tile_size —
        // the exact "default no background" case in-game.
        let theme = parse_theme("[*]\nbackground: ftblibrary:textures/gui/background_squares.png; color=#DCFFFFFF; tile_size=64\n");
        let bg = background_for(&theme, "").expect("default background");
        assert_eq!(bg.key, "ftblibrary:textures/gui/background_squares.png");
        assert_eq!(bg.color.as_deref(), Some("#DCFFFFFF"));
        assert_eq!(bg.tile_size, Some(64));
    }

    #[test]
    fn gui_scale_reads_explicit_value() {
        let dir = std::env::temp_dir().join(format!("mc_gui_scale_test_{}", std::process::id()));
        std::fs::create_dir_all(dir.join("minecraft")).unwrap();
        std::fs::write(dir.join("minecraft/options.txt"), "keybindings:foo\nguiScale:3\nfov:70\n").unwrap();
        assert_eq!(read_game_gui_scale(&dir), 3);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gui_scale_defaults_to_one_for_missing_or_auto() {
        let dir = std::env::temp_dir().join(format!("mc_gui_scale_missing_{}", std::process::id()));
        // no options.txt at all
        assert_eq!(read_game_gui_scale(&dir), 1);
        std::fs::create_dir_all(dir.join("minecraft")).unwrap();
        // auto (0) → 1, out of range (9) → 1
        std::fs::write(dir.join("minecraft/options.txt"), "guiScale:0\n").unwrap();
        assert_eq!(read_game_gui_scale(&dir), 1);
        std::fs::write(dir.join("minecraft/options.txt"), "guiScale:9\n").unwrap();
        assert_eq!(read_game_gui_scale(&dir), 1);
        // malformed value → 1
        std::fs::write(dir.join("minecraft/options.txt"), "guiScale:lots\n").unwrap();
        assert_eq!(read_game_gui_scale(&dir), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
