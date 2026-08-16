// Path validation: canonical containment checks against a config/instance root,
// plus the config-root resolvers. Split from path_safety.rs so the module stays
// within the 300-line ceiling.

use std::path::{Component, Path, PathBuf};

/// Config base directory: `~/.config/modcanvas/mirrored_configs`. The previously
/// used temp mirror (`{temp_dir}/modcanvas_configs`) is deprecated in favor of
/// editing the selected instance's real `config/` folder; this constant remains
/// for legacy graph artifacts only.
pub fn config_base_dir() -> PathBuf {
    std::env::temp_dir().join("modcanvas_configs")
}

/// Resolve the real config directory for an instance rooted at `project_path`.
pub fn project_config_root(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join("config")
}

/// Validate that `path` resolves to a file strictly inside `root`.
///
/// Rejects:
/// - Absolute paths that escape `root`
/// - Relative paths that escape via `../`
/// - Symlinks that point outside `root`
fn validate_in_root(root: &Path, path: &str, require_exists: bool) -> Result<PathBuf, String> {
    // Lexical `..` check FIRST (s65 CI finding): the Win32 path parser
    // collapses `\x\..\` before the filesystem sees it, so a root like
    // `<tmp>/ok/../..` RESOLVES (and exists()) on Windows while the OS stat
    // fails on Linux. An existence-based guard is platform-dependent —
    // reject ParentDir components lexically so the scope is enforced the
    // same way on every OS. (Test: never_creates_file_outside_project_root
    // failed on Windows because the write silently escaped the project root.)
    let has_parent_dir = |p: &Path| p.components().any(|c| matches!(c, Component::ParentDir));
    if has_parent_dir(root) {
        return Err(format!(
            "Access denied: root path contains '..': '{}'",
            root.display()
        ));
    }
    let user_path = PathBuf::from(path);
    if has_parent_dir(&user_path) {
        return Err(format!(
            "Access denied: path contains '..': '{}'",
            user_path.display()
        ));
    }

    // Resolve relative inputs against the root; absolute paths are used as-is.
    let candidate = if user_path.is_absolute() {
        user_path
    } else {
        root.join(user_path)
    };

    if !root.exists() {
        return Err(format!(
            "Config directory does not exist: '{}'",
            root.display()
        ));
    }

    let root_canonical = root
        .canonicalize()
        .map_err(|e| format!("Config base resolution failed: {e}"))?;

    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("Path resolution failed: {e}"))?
    } else if require_exists {
        return Err(format!(
            "File not found: '{}'",
            candidate.display()
        ));
    } else {
        // Write target: the file may not exist yet. Walk up to the nearest
        // existing ancestor, canonicalize it, verify it is inside the scope,
        // then re-append the missing components. This allows writing into
        // nested directories that have not been created yet.
        let mut suffix: Vec<std::ffi::OsString> = Vec::new();
        if let Some(file_name) = candidate.file_name() {
            suffix.push(file_name.to_os_string());
        }
        let mut probe = candidate.parent().unwrap_or_else(|| root);
        let mut base = loop {
            if probe.exists() {
                break canonicalize(&root_canonical, probe)?;
            }
            match probe.file_name() {
                Some(name) => suffix.push(name.to_os_string()),
                None => return Err(format!(
                    "Path has no resolvable parent: '{}'",
                    candidate.display()
                )),
            }
            match probe.parent() {
                Some(p) => probe = p,
                None => return Err(format!(
                    "Path has no resolvable parent: '{}'",
                    candidate.display()
                )),
            }
        };
        for component in suffix.iter().rev() {
            base.push(component);
        }
        return Ok(base);
    };

    if resolved.starts_with(&root_canonical) {
        Ok(candidate)
    } else {
        Err(format!(
            "Access denied: path '{}' is outside the config directory",
            candidate.display()
        ))
    }
}

/// Canonicalize `probe` and assert it stays inside the canonical root.
fn canonicalize(root_canonical: &Path, probe: &Path) -> Result<PathBuf, String> {
    let canonical = probe
        .canonicalize()
        .map_err(|e| format!("Parent path resolution failed: {e}"))?;
    if canonical.starts_with(root_canonical) {
        Ok(canonical)
    } else {
        Err(format!(
            "Access denied: path '{}' escapes the config directory",
            probe.display()
        ))
    }
}

/// Validate that `path` resolves to a file strictly inside `root`.
pub fn validate_under_root(root: &Path, path: &str) -> Result<PathBuf, String> {
    validate_in_root(root, path, false)
}

/// Validate a read path strictly inside an instance's `config/` directory.
/// `root` is the project's instance base path; the file is scoped to `<root>/config`.
pub fn validate_project_read(root: &str, path: &str) -> Result<PathBuf, String> {
    validate_in_root(&project_config_root(root), path, true)
}

/// Validate a write path strictly inside an instance's `config/` directory,
/// creating the `config/` directory if it does not yet exist.
pub fn validate_project_write(root: &str, path: &str) -> Result<PathBuf, String> {
    let config_root = project_config_root(root);
    std::fs::create_dir_all(&config_root)
        .map_err(|e| format!("Failed to create config directory: {e}"))?;
    validate_in_root(&config_root, path, false)
}

/// Validate a path is safe to read as a config file (must be inside the temp
/// mirror). Kept for legacy graph-artifact reads; the live config editor reads
/// from the instance's real `config/` folder via `validate_project_read`.
pub fn validate_config_read(path: &str) -> Result<PathBuf, String> {
    validate_in_root(&config_base_dir(), path, true)
}

/// Validate a path is safe to write as a config file (must be inside the base dir).
pub fn validate_config_write(path: &str) -> Result<PathBuf, String> {
    validate_in_root(&config_base_dir(), path, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_project_write_creates_config_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let config_dir = project_config_root(&root);
        assert!(!config_dir.exists(), "config dir should not exist before write");

        let validated = validate_project_write(&root, "test.toml").unwrap();
        assert!(config_dir.exists(), "validate_project_write should create config/");
        // validate_in_root returns CANONICALIZED paths; on Windows canonicalize
        // emits a `\\?\` prefix + expanded 8.3 names the raw join lacks (s65 CI
        // finding) — canonicalize the expected side before comparing.
        let expected = config_dir.canonicalize().unwrap().join("test.toml");
        assert_eq!(validated, expected);
    }

    #[test]
    fn test_project_read_requires_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let config_dir = project_config_root(&root);
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join("a.toml"), "x").unwrap();

        assert!(validate_project_read(&root, "a.toml").is_ok());
        assert!(validate_project_read(&root, "missing.toml").is_err(), "missing file should be rejected");
    }

    #[test]
    fn test_project_read_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        std::fs::create_dir_all(project_config_root(&root)).unwrap();

        assert!(validate_project_read(&root, "../outside.png").is_err());
        assert!(validate_project_read(&root, "sub/../../outside.png").is_err());
        assert!(validate_project_read(&root, "/absolute/path").is_err());
    }

    #[test]
    #[cfg(unix)]
    fn test_project_read_rejects_symlink_escape() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let config_dir = project_config_root(&root);
        std::fs::create_dir_all(&config_dir).unwrap();

        let outside = tmp.path().join("secret.txt");
        std::fs::write(&outside, "secret").unwrap();
        let link = config_dir.join("link.toml");
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        assert!(
            validate_project_read(&root, "link.toml").is_err(),
            "symlink escaping config root must be rejected"
        );
    }

    #[test]
    fn test_project_write_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        assert!(validate_project_write(&root, "../evil.toml").is_err());
        assert!(validate_project_write(&root, "a/../../evil.toml").is_err());
        assert!(validate_project_write(&root, "/etc/passwd").is_err());
    }

    #[test]
    fn test_project_write_allows_nested() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let validated = validate_project_write(&root, "sub/dir/nested.toml").unwrap();
        // Canonicalized expected side — see test_project_write_creates_config_root
        // for the Windows form-mismatch note (s65).
        let expected = project_config_root(&root)
            .canonicalize()
            .unwrap()
            .join("sub")
            .join("dir")
            .join("nested.toml");
        assert_eq!(validated, expected);
    }

    #[test]
    fn test_under_root_resolves_to_project_root_not_config() {
        // s45 regression lock (KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG):
        // KubeJS reads server scripts from `<root>/kubejs/server_scripts/` and
        // CraftTweaker from `<root>/scripts/` — the PROJECT root, not config/.
        // The recipe writer must resolve these through validate_under_root
        // (root-scoped), never validate_project_write (config-scoped).
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let root_canon = root.canonicalize().unwrap();
        std::fs::create_dir_all(root.join("kubejs").join("server_scripts")).unwrap();

        let kubejs = validate_under_root(root, "kubejs/server_scripts/modcanvas_recipes.js").unwrap();
        let kubejs_expected = root_canon
            .join("kubejs")
            .join("server_scripts")
            .join("modcanvas_recipes.js");
        assert_eq!(kubejs, kubejs_expected);
        assert!(
            kubejs.starts_with(&root_canon),
            "script must resolve inside the project root, not config/: {kubejs:?}"
        );

        let ct = validate_under_root(root, "scripts/modcanvas_crafttweaker.zs").unwrap();
        assert_eq!(ct, root_canon.join("scripts").join("modcanvas_crafttweaker.zs"));
        assert!(ct.starts_with(&root_canon));

        // The config-scoped validator is the WRONG tool for scripts — it
        // silently redirects them under config/.
        let wrong = validate_project_write(root.to_str().unwrap(), "kubejs/server_scripts/modcanvas_recipes.js").unwrap();
        assert!(
            wrong.starts_with(&root_canon.join("config")),
            "config-scoped validator must not be used for scripts"
        );
    }
}
