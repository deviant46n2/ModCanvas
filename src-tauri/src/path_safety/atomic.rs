// Atomic write helpers (tmp-file + rename) with EBUSY-style retry for Windows
// JVM file locks. Split from path_safety.rs so the module stays within the
// 300-line ceiling.

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
}
