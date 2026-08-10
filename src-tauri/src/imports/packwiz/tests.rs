use super::*;
use tempfile::tempdir;
use std::fs;

#[test]
fn test_packwiz_parse() {
    let dir = tempdir().unwrap();
    let workspace = dir.path();

    // Create pack.toml
    let pack_toml = r#"
name = "Test Pack"
version = "1.0.0"
minecraft = "1.20.1"
loader = "neoforge"
"#;
    fs::write(workspace.join("pack.toml"), pack_toml).unwrap();

    // Create index.toml
    let index_toml = r#"
["mods/jei-1.20.1-15.0.0.1.jar"]
file = "mods/jei-1.20.1-15.0.0.1.jar"
hash = "abc123"
url = "https://example.com/jei.jar"

["mods/create-1.20.1-0.5.1.jar"]
file = "mods/create-1.20.1-0.5.1.jar"
hash = "def456"
url = "https://example.com/create.jar"
side = "both"
"#;
    fs::write(workspace.join("index.toml"), index_toml).unwrap();

    // Create mods dir and .pw.toml
    let mods_dir = workspace.join("mods");
    fs::create_dir_all(&mods_dir).unwrap();

    let jei_meta = r#"
name = "Just Enough Items"
filename = "jei-1.20.1-15.0.0.1.jar"
side = "both"
"#;
    fs::write(mods_dir.join("jei-1.20.1-15.0.0.1.pw.toml"), jei_meta).unwrap();

    // Parse
    let ws = PackwizWorkspace::load(workspace).unwrap();
    assert_eq!(ws.pack.name, "Test Pack");
    assert_eq!(ws.index.len(), 2);
    assert!(ws.mod_metadata.contains_key("jei-1.20.1-15.0.0.1.jar"));

    let ui_mods = ws.get_mods_for_ui();
    assert_eq!(ui_mods.len(), 2);
    let jei = ui_mods.iter().find(|m| m.id.contains("jei")).unwrap();
    assert_eq!(jei.name, "Just Enough Items");
}
