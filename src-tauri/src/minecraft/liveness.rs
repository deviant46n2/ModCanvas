// Instance liveness detection — the single source of truth for "is the game
// running?".
//
// The instance status field is set from the Prism wrapper's lifecycle
// (Running at spawn, Stopped at exit), but the wrapper and the game are
// different processes: the wrapper can exit while the game keeps running
// (Prism bails with code 0 when the instance is already up). Deriving status
// from wrapper bookkeeping produced exactly that lie. The process table is
// the truth: a game process whose cmdline contains the instance's game_dir
// IS the instance running.
//
// Seam: Linux scans /proc/*/cmdline; Windows will scan via WMI / NtQuery.
// MVP is Linux-only (deliberate scope decision) — the Windows implementation
// is a bounded later step behind this trait, not speculative code now.
use std::path::Path;

/// Answers "is there a live process for this instance's game_dir?"
pub trait InstanceLiveness: Send + Sync {
    fn is_running(&self, game_dir: &str) -> bool;
}

/// Linux implementation: scan /proc/*/cmdline for the instance ROOT substring.
///
/// Measured against a real running game (2026-08-08): the live EntryPoint
/// process cmdline carries the instance root — via
/// `-Djava.library.path=.../natives` — and never the `/minecraft` game_dir
/// subdir. Callers pass the root (see `list_instances` stripping the suffix).
#[derive(Default)]
pub struct ProcLiveness;

impl InstanceLiveness for ProcLiveness {
    fn is_running(&self, game_dir: &str) -> bool {
        let Ok(entries) = std::fs::read_dir("/proc") else {
            return false;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(pid_str) = name.to_str() else { continue };
            if !pid_str.bytes().all(|b| b.is_ascii_digit()) {
                continue; // not a process directory
            }
            let cmdline_path = Path::new("/proc").join(pid_str).join("cmdline");
            let Ok(raw) = std::fs::read(&cmdline_path) else { continue };
            // cmdline is NUL-separated; the whole buffer is the command line.
            if raw.windows(game_dir.len()).any(|w| w == game_dir.as_bytes()) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proc_liveness_finds_no_process_for_nonexistent_dir() {
        let liveness = ProcLiveness;
        assert!(!liveness.is_running("/definitely/not/a/real/instance/game_dir"));
    }

    #[test]
    #[cfg(unix)] // /proc is Linux-only; the Windows WMI/NtQuery seam is documented, not built (s65)
    fn proc_liveness_finds_self_cmdline() {
        // The test runner's own cmdline contains its binary path; we can't
        // know a dir that matches it, but we CAN verify the scan is
        // structurally sound: scanning for a guaranteed-absent marker is
        // false, and the current process is findable by its own pid file
        // name if we pass a dir that appears in it. Use the process name.
        let self_pid = std::process::id().to_string();
        // Sanity: the current process's cmdline exists and is non-empty.
        let raw = std::fs::read(format!("/proc/{self_pid}/cmdline")).expect("self cmdline readable");
        assert!(!raw.is_empty());
        // And the liveness scan for an impossible marker is false (no crash).
        assert!(!ProcLiveness.is_running("\u{0}impossible\u{0}"));
    }

    #[test]
    #[cfg(unix)] // /proc is Linux-only; the Windows WMI/NtQuery seam is documented, not built (s65)
    fn proc_liveness_matches_a_real_substring_of_own_cmdline() {
        // The running test binary's cmdline is /proc/<pid>/cmdline; the first
        // argument (argv[0]) is the binary path. A dir that prefixes that
        // path IS a substring of the cmdline, so liveness must find it.
        // This mirrors the real case: the game's cmdline contains the
        // instance root (via -Djava.library.path=.../natives), so scanning
        // for the root matches.
        let self_pid = std::process::id();
        let raw = std::fs::read(format!("/proc/{self_pid}/cmdline")).expect("self cmdline readable");
        // First NUL-terminated token = argv[0] = this binary's path.
        let argv0 = raw.split(|&b| b == 0).next().unwrap_or(&[]);
        let argv0 = String::from_utf8_lossy(argv0);
        assert!(!argv0.is_empty(), "argv[0] should be non-empty");
        // Take the parent dir of the binary as the "instance root" analog.
        let root = std::path::Path::new(&*argv0)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| argv0.to_string());
        assert!(
            ProcLiveness.is_running(&root),
            "the binary's parent dir ({root}) must be a substring of its own cmdline"
        );
    }
}
