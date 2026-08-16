use std::path::{Component, Path, PathBuf};

mod atomic;
mod history;
mod imports;
mod validation;

pub use atomic::{atomic_write, atomic_write_str};
pub use history::{history_journal_path, history_journal_path_in};
pub use imports::imported_pack_extract_dir;
pub use validation::{
    config_base_dir, project_config_root, validate_config_read, validate_config_write,
    validate_project_read, validate_project_write, validate_under_root,
};
///
/// Returns the normalized relative path if safe, or an error if the path escapes
/// the destination directory via `..` components or absolute path prefixes.
pub fn sanitize_zip_entry_path(entry_path: &str) -> Result<String, String> {
    if entry_path.is_empty() {
        return Err("Zip entry path is empty".to_string());
    }

    let path = Path::new(entry_path);

    // Reject absolute paths
    if path.is_absolute() {
        return Err(format!(
            "Zip entry path must be relative, got absolute: '{entry_path}'"
        ));
    }

    // Normalize: collect only Normal components (skip RootDir, ParentDir, CurDir)
    // and join with '/' EXPLICITLY — ZIP entry names are spec'd to forward
    // slashes on every OS. PathBuf::to_string_lossy() would emit '\' on
    // Windows (s65 CI finding: sanitize returned foo\bar.txt, breaking
    // by_name() lookups and producing spec-violating archives).
    let mut parts: Vec<std::ffi::OsString> = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(c) => parts.push(c.to_os_string()),
            Component::CurDir => { /* skip `.` */ }
            Component::ParentDir => {
                return Err(format!(
                    "Zip entry path contains '..' traversal: '{entry_path}'"
                ));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!(
                    "Zip entry path contains absolute component: '{entry_path}'"
                ));
            }
        }
    }

    if parts.is_empty() {
        return Err("Zip entry path resolves to empty".to_string());
    }

    // Verify no `..` survived normalization (defense in depth)
    let joined = parts
        .iter()
        .map(|p| p.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    if joined.split('/').any(|part| part == "..") {
        return Err(format!(
            "Zip entry path contains '..' traversal: '{entry_path}'"
        ));
    }

    Ok(joined)
}

pub fn sanitize_project_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Project name cannot be empty".to_string());
    }
    if trimmed.len() > 128 {
        return Err("Project name is too long (max 128 characters)".to_string());
    }
    // Reject path-dangerous characters
    if trimmed
        .chars()
        .any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' | '\n' | '\r'))
    {
        return Err("Project name contains invalid characters".to_string());
    }
    // Reject directory traversal attempts
    if trimmed == ".." || trimmed == "." || trimmed.contains("../") || trimmed.contains("..\\") {
        return Err("Project name cannot be a path traversal sequence".to_string());
    }
    Ok(trimmed.to_string())
}

/// Expand a leading `~/` to the user's home directory. POSIX filesystem
/// calls do NOT expand `~` (that is a shell feature, not a filesystem one),
/// so any path handed to `std::fs` must be expanded first — a literal
/// `~/modpacks/foo` otherwise fails with ENOENT. Non-tilde paths are
/// returned unchanged. Used by `create_project`, where the frontend may
/// send `~/modpacks/<name>`.
pub fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_next::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// Resolve the ModCanvas-owned working-graph file for a project workspace.
/// Editor state (the quest working graph) lives in a hidden `.modcanvas/`
/// state directory under the instance root so it survives restarts and stays
/// scoped strictly inside the project/instance directory. The directory is
/// created on demand; the returned path is validated to resolve inside the
/// project root (defense against traversal/symlink escapes).
pub fn quest_graph_path(project_path: &str) -> Result<PathBuf, String> {
    state_file_path(project_path, "quests.json")
}

/// Resolve any `.modcanvas/` state file for a project workspace. The single
/// canonical scoping answer: the state dir is created on demand, the result
/// is validated to resolve inside the project root (defense against
/// traversal/symlink escapes). All editor private state (quest graph today,
/// behavior IR tomorrow) resolves through this one function so the escape
/// guard is not re-implemented per feature.
pub fn state_file_path(project_path: &str, file_name: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(project_path);
    if !root.exists() {
        return Err(format!(
            "Project root does not exist: '{}'",
            root.display()
        ));
    }
    let root_canonical = root
        .canonicalize()
        .map_err(|e| format!("Project root resolution failed: {e}"))?;

    let state_dir = root.join(".modcanvas");
    std::fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to create ModCanvas state dir: {e}"))?;
    let state_canonical = state_dir
        .canonicalize()
        .map_err(|e| format!("ModCanvas state dir resolution failed: {e}"))?;

    if !state_canonical.starts_with(&root_canonical) {
        return Err("Access denied: ModCanvas state dir escapes the project root".to_string());
    }

    Ok(state_canonical.join(file_name))
}

/// Sanitize a user-supplied project name for use in directory paths.
/// Only allows alphanumeric, hyphens, underscores, and spaces.
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_sanitize_zip_entry_accepts_normal() {
        assert_eq!(sanitize_zip_entry_path("foo/bar.txt").unwrap(), "foo/bar.txt");
        assert_eq!(sanitize_zip_entry_path("a/b/c/d.json").unwrap(), "a/b/c/d.json");
        assert_eq!(sanitize_zip_entry_path("file.txt").unwrap(), "file.txt");
    }

    #[test]
    fn test_sanitize_zip_entry_rejects_traversal() {
        assert!(sanitize_zip_entry_path("../etc/passwd").is_err());
        assert!(sanitize_zip_entry_path("foo/../../etc/passwd").is_err());
        assert!(sanitize_zip_entry_path("..").is_err());
        assert!(sanitize_zip_entry_path("foo/..").is_err());
    }

    #[test]
    fn test_sanitize_zip_entry_rejects_absolute() {
        assert!(sanitize_zip_entry_path("/etc/passwd").is_err());
        assert!(sanitize_zip_entry_path("/").is_err());
    }

    #[test]
    fn test_sanitize_zip_entry_rejects_empty() {
        assert!(sanitize_zip_entry_path("").is_err());
    }

    #[test]
    fn test_sanitize_project_name_ok() {
        assert_eq!(sanitize_project_name("My Project").unwrap(), "My Project");
        assert_eq!(sanitize_project_name("hello-world").unwrap(), "hello-world");
        assert_eq!(sanitize_project_name("test_project_123").unwrap(), "test_project_123");
    }

    #[test]
    fn test_sanitize_project_name_rejects_bad() {
        assert!(sanitize_project_name("../etc").is_err());
        assert!(sanitize_project_name("foo/bar").is_err());
        assert!(sanitize_project_name("").is_err());
        assert!(sanitize_project_name("   ").is_err());
    }

    #[test]
    fn test_quest_graph_path_is_scoped_to_project_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let path = quest_graph_path(&root).unwrap();
        assert!(path.ends_with(".modcanvas/quests.json"));
        assert!(path.parent().unwrap().is_dir(), "state dir should be created");
        // Compare against the CANONICALIZED tmp root: state_file_path returns
        // canonical paths, and on Windows canonicalize emits a `\\?\` prefix +
        // expanded 8.3 names (RUNNER~1 -> runneradmin) that the raw tempdir
        // path lacks (s65 CI finding).
        let tmp_canon = tmp.path().canonicalize().unwrap();
        assert!(path.starts_with(tmp_canon));
    }

    #[test]
    fn test_quest_graph_path_requires_existing_root() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("does-not-exist").to_string_lossy().to_string();
        assert!(quest_graph_path(&missing).is_err());
    }

    #[test]
    fn test_quest_graph_path_writes_atomically() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let path = quest_graph_path(&root).unwrap();

        atomic_write_str(&path, "{\"nodes\":[]}").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"nodes\":[]}");
        let tmp_canon = tmp.path().canonicalize().unwrap();
        assert!(path.starts_with(tmp_canon));
    }

    #[test]
    fn test_state_file_path_is_scoped_and_named() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let path = state_file_path(&root, "behaviors.json").unwrap();
        assert!(path.ends_with(".modcanvas/behaviors.json"));
        assert!(path.parent().unwrap().is_dir(), "state dir should be created");
        let tmp_canon = tmp.path().canonicalize().unwrap();
        assert!(path.starts_with(tmp_canon));

        // Two calls return the same path — deterministic.
        assert_eq!(state_file_path(&root, "behaviors.json").unwrap(), path);
    }
}
