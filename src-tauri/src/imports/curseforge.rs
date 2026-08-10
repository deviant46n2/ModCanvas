//! CurseForge pack import/export. Split into submodules: `manifest`
//! (manifest.json data structures), `import` (the `CurseForgeImporter`),
//! and `export` (the `CurseForgeExporter`). The public API of this module is
//! unchanged by the split.

pub mod manifest;
mod export;
mod import;

pub use export::CurseForgeExporter;
pub use import::CurseForgeImporter;
pub use manifest::{CurseForgeFile, CurseForgeManifest, CurseForgeMinecraft, CurseForgeModLoader};
