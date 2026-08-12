//! Tauri-specific adapter bridging `minecraft::ProgressEmitter` to Tauri's
//! event system. Split from commands/mod.rs (s47, line-limit) — a separate
//! bridge adapter with one job, used by both runtime.rs and project.rs.

use crate::minecraft::ProgressEmitter;

/// Emits launch progress as Tauri events (`mc-launch-progress`).
pub(crate) struct TauriProgressEmitter(pub tauri::AppHandle);

impl ProgressEmitter for TauriProgressEmitter {
    fn emit_progress(&self, progress: crate::minecraft::LaunchProgress) {
        use tauri::Emitter;
        let _ = self.0.emit("mc-launch-progress", progress);
    }
}
