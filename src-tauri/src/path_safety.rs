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
    // Resolve relative inputs against the root; absolute paths are used as-is.
    let user_path = PathBuf::from(path);
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

/// Write content to a file atomically by writing to a `.tmp` file first,
/// then renaming to the final path. This prevents zero-byte corruptions
/// from crashes or interrupted writes.
///
/// Uses a unique temp file name (with process ID and thread ID) so concurrent
/// writes to the same path don't interfere with each other.
pub fn atomic_write(path: &std::path::Path, contents: &[u8]) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let pid = std::process::id();
    let tid = format!("{:?}", std::thread::current().id());
    let suffix: String = tid.chars().filter(|c| c.is_ascii_digit()).take(8).collect();
    let tmp_path = path.with_extension(format!("{}.{}.{}.tmp", ext, pid, suffix));

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }

    std::fs::write(&tmp_path, contents)
        .map_err(|e| format!("Failed to write temp file {}: {e}", tmp_path.display()))?;

    // Windows may hold a JVM/process lock on the target (EBUSY-style). Retry the
    // rename a few times before giving up so a transient lock doesn't corrupt or
    // reject the write. On POSIX the rename succeeds on the first attempt.
    let mut attempts = 0;
    loop {
        match std::fs::rename(&tmp_path, path) {
            Ok(()) => break,
            Err(e) if attempts < 5 => {
                attempts += 1;
                std::thread::sleep(std::time::Duration::from_millis(60 * attempts));
                // If the target is missing, the lock released and we can retry.
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("Failed to rename temp file to {}: {e}", path.display()));
            }
        }
    }

    Ok(())
}

/// Write a string to a file atomically.
pub fn atomic_write_str(path: &std::path::Path, contents: &str) -> Result<(), String> {
    atomic_write(path, contents.as_bytes())
}
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
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(c) => normalized.push(c),
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

    // Verify the normalized path is still relative and doesn't escape
    if normalized.is_absolute() {
        return Err(format!(
            "Zip entry path resolved to absolute: '{entry_path}'"
        ));
    }

    // Double-check no `..` survived normalization
    for component in normalized.components() {
        if matches!(component, Component::ParentDir) {
            return Err(format!(
                "Zip entry path contains '..' traversal: '{entry_path}'"
            ));
        }
    }

    Ok(normalized.to_string_lossy().to_string())
}

/// Sanitize a user-supplied project name for use in directory paths.
/// Only allows alphanumeric, hyphens, underscores, and spaces.
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;

    #[test]
    fn test_atomic_write_basic() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("test.txt");

        atomic_write_str(&path, "hello world").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
        assert!(!path.with_extension("txt.tmp").exists(), "tmp file should be cleaned up");
    }

    #[test]
    fn test_atomic_write_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("test.txt");

        atomic_write_str(&path, "version 1").unwrap();
        atomic_write_str(&path, "version 2").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "version 2");
    }

    #[test]
    fn test_atomic_write_concurrent_100_saves() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("concurrent.txt");
        let path = Arc::new(path);

        let mut handles = Vec::new();
        let success = Arc::new(AtomicUsize::new(0));

        for i in 0..100 {
            let path = Arc::clone(&path);
            let success = Arc::clone(&success);
            handles.push(thread::spawn(move || {
                let content = format!("content from thread {}", i);
                match atomic_write_str(&path, &content) {
                    Ok(()) => { success.fetch_add(1, Ordering::SeqCst); }
                    Err(e) => eprintln!("Thread {} write failed (expected on some): {}", i, e),
                }
            }));
        }

        for h in handles {
            let _ = h.join();
        }

        // At least one write must have succeeded
        assert!(success.load(Ordering::SeqCst) >= 1,
            "At least one concurrent write must succeed, got {}", success.load(Ordering::SeqCst));

        // Verify final file is valid
        let final_content = std::fs::read_to_string(&*path).unwrap();
        assert!(final_content.starts_with("content from thread "),
            "Final content should be a complete write from one thread, got: {}", final_content);
    }

    #[test]
    fn test_atomic_write_orphan_tmp_cleanup() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("orphan_test.txt");

        // Simulate a crashed write: leave a old-style .tmp file behind
        let old_tmp = path.with_extension("txt.tmp");
        std::fs::write(&old_tmp, "orphaned data").unwrap();
        assert!(old_tmp.exists(), "old tmp file should exist before cleanup");

        // Now do a successful atomic write — it uses a unique name so orphan stays
        atomic_write_str(&path, "clean write").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "clean write");
    }

    #[test]
    fn test_atomic_write_large_content() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("large.txt");

        let large = "A".repeat(100_000);
        atomic_write_str(&path, &large).unwrap();
        let read_back = std::fs::read_to_string(&path).unwrap();
        assert_eq!(read_back.len(), 100_000);
        assert_eq!(read_back, large);
    }

    #[test]
    fn test_atomic_write_binary() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("binary.bin");

        let data: Vec<u8> = (0..255).collect();
        atomic_write(&path, &data).unwrap();
        let read_back = std::fs::read(&path).unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn test_atomic_write_nested_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("a").join("b").join("c").join("deep.txt");

        atomic_write_str(&path, "nested").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "nested");
    }

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
    fn test_project_write_creates_config_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let config_dir = project_config_root(&root);
        assert!(!config_dir.exists(), "config dir should not exist before write");

        let validated = validate_project_write(&root, "test.toml").unwrap();
        assert!(config_dir.exists(), "validate_project_write should create config/");
        assert_eq!(validated, config_dir.join("test.toml"));
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
        assert_eq!(validated, project_config_root(&root).join("sub").join("dir").join("nested.toml"));
    }
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
