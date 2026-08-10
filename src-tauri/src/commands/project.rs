//! Project lifecycle Tauri commands: create/list/delete projects and their
//! mods, plus launch and companion-deploy helpers. Split across the
//! [`lifecycle`], [`mods`], and [`launch`] submodules; everything is
//! re-exported here so `commands::project::*` (and through it the tauri
//! handler) keeps resolving for callers.

mod launch;
mod lifecycle;
mod mods;

pub use launch::*;
pub use lifecycle::*;
pub use mods::*;
