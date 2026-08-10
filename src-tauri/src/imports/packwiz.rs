//! Packwiz workspace parsing and import. Split into submodules: `types`
//! (data structures), `workspace` (workspace loading + queries),
//! `importer` (the `PackwizImporter`), and `tests`. The public API of this
//! module is unchanged by the split.

pub mod types;
mod importer;
mod workspace;

pub use importer::PackwizImporter;
pub use types::{
    PackwizCurseForgeInfo, PackwizIndexEntry, PackwizModMeta, PackwizModUiInfo,
    PackwizModrinthInfo, PackwizPack, PackwizUpdateInfo, PackwizWorkspace,
};
pub use workspace::parse_packwiz_workspace;

#[cfg(test)]
mod tests;
