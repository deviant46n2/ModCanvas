use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextureEntry {
    pub namespace: String,
    pub path: String,
    pub raw_key: String,
    pub canonical_key: String,
    pub clean_key: String,
    // Local file path for on-demand texture serving (JAR path or filesystem path)
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VirtualAssetRegistry {
    /// Combined lookup map: raw_key, canonical_key, and clean_key all point to the same data_url
    pub by_id: HashMap<String, String>,
    /// All parsed texture entries for introspection
    pub all_textures: Vec<TextureEntry>,
    pub jars_scanned: usize,
    pub textures_indexed: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct IngestResult {
    pub asset_registry: VirtualAssetRegistry,
    pub jars_scanned: usize,
    pub textures_indexed: usize,
    pub active_instance: String,
}

/// An empty result for an instance that has no scannable mods directory.
pub(crate) fn empty_ingest_result(active_instance: String) -> IngestResult {
    IngestResult {
        asset_registry: VirtualAssetRegistry {
            by_id: HashMap::new(),
            all_textures: Vec::new(),
            jars_scanned: 0,
            textures_indexed: 0,
        },
        jars_scanned: 0,
        textures_indexed: 0,
        active_instance,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct IngestCache {
    pub(crate) textures: Vec<TextureEntry>,
    pub(crate) textures_indexed: usize,
    pub(crate) jar_count: usize,
    pub(crate) kubejs_assets_mtime: Option<u64>,
    pub(crate) kubejs_texture_count: usize,
    pub(crate) cache_version: u32,
}

/// Progress event payload streamed to the frontend during ingest.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestProgress {
    pub stage: String,
    pub message: String,
    pub progress: u8,
    pub file: Option<String>,
    pub done: usize,
    pub total: usize,
}
