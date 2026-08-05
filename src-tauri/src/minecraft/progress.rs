use serde::Serialize;

/// Trait for emitting launch progress events, abstracting away Tauri's AppHandle.
/// The core layer uses this trait; the Tauri command layer provides the real implementation.
pub trait ProgressEmitter: Send + Sync {
    fn emit_progress(&self, progress: LaunchProgress);
}

/// No-op emitter for tests and contexts without a Tauri app handle.
pub struct NullProgressEmitter;

impl ProgressEmitter for NullProgressEmitter {
    fn emit_progress(&self, _progress: LaunchProgress) {}
}

#[derive(Clone, Serialize)]
pub struct LaunchProgress {
    pub phase: String,
    pub message: String,
    pub bytes: Option<u64>,
    pub total: Option<u64>,
}
