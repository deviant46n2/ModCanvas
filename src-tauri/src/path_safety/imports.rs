// Persistent per-import extraction directory resolution (XDG/HOME data dir).
// Split from path_safety.rs so the module stays within the 300-line ceiling.

use super::sanitize_project_name;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Resolve the imports root from environment (XDG_DATA_HOME, else `~/.local/share`).
fn imports_base_dir() -> Result<PathBuf, String> {
    if let Ok(data) = std::env::var("XDG_DATA_HOME") {
        return Ok(PathBuf::from(data).join("modcanvas").join("imports"));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home).join(".local").join("share").join("modcanvas").join("imports"));
    }
    Err("Cannot resolve a data directory for imported packs".to_string())
}

/// Create a fresh per-import directory inside `base` named `<name>-<short-id>`.
fn make_import_dir(base: &Path, hint: &str) -> Result<PathBuf, String> {
    let name = sanitize_project_name(hint).unwrap_or_else(|_| "pack".to_string());
    let short_id = Uuid::new_v4().to_string().split('-').next().unwrap_or("x").to_string();
    let dir = base.join(format!("{}-{}", name, short_id));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create import directory: {e}"))?;
    Ok(dir)
}

/// Persistent destination for extracted `.mrpack` imports.
///
/// Returns a fresh per-import directory under the user's data dir
/// (`~/.local/share/modcanvas/imports/<name>-<short-id>`), created on demand.
/// The old approach extracted into a `tempdir()` whose guard dropped when the
/// import command returned, leaving `project.path` pointing at a deleted
/// directory (empty item registry, no textures, no files). Imported packs must
/// live somewhere stable so the whole workspace works.
pub fn imported_pack_extract_dir(hint: &str) -> Result<PathBuf, String> {
    let base = imports_base_dir()?;
    make_import_dir(&base, hint)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_make_import_dir_creates_persistent_unique_dirs() {
        let tmp = tempfile::tempdir().unwrap();

        let a = make_import_dir(tmp.path(), "My Pack").unwrap();
        let b = make_import_dir(tmp.path(), "My Pack").unwrap();

        assert!(a.is_dir(), "extract dir should be created on demand");
        assert_ne!(a, b, "each import must get its own directory");
        assert!(a.starts_with(tmp.path()), "must live under the given base");
        let name = a.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.starts_with("My Pack-"), "should carry the sanitized pack name");
    }

    #[test]
    fn test_make_import_dir_sanitizes_dangerous_hints() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_import_dir(tmp.path(), "../../evil/name").unwrap();
        let name = dir.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.starts_with("pack-"), "traversal hints fall back to 'pack'");
    }
}
