// Pack Index model (P1-PACKINDEX, roadmap §7.3). A DERIVED, read-mostly
// reference spine over the existing scans — never authoritative, never
// write-through. Canonical keys are the repo's existing stable ID forms
// (§8.3.1 "state your canonical key"): items `ns:path`, tags `#ns:path`,
// recipes `ns:name`, quests the graph's opaque node id.
//
// The 3-layer rule: this is the thinking room — pure data, no I/O. Building
// the index from scans happens in `build.rs`; callers own the bytes.

use serde::{Deserialize, Serialize};

/// A reference from a source to a target item id. Sources are typed so
/// consumers can group ("recipes using this item" vs "quests rewarding it").
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ItemReference {
    /// Source kind — which store the reference came from.
    pub source_kind: String,
    /// Source id within that store (recipe id, quest node id, tag id).
    pub source_id: String,
    /// The referenced item, canonical form `ns:path`.
    pub item_id: String,
}

/// One resolved-or-dead reference finding. Dead = the item id has no entry in
/// the item registry — surfaced as a NAMED finding, never a silent miss.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReferenceFinding {
    pub source_kind: String,
    pub source_id: String,
    /// The item id as written by the source.
    pub referenced_id: String,
    /// True when the referenced id resolves in the item registry.
    pub resolved: bool,
}

/// The derived Pack Index. Deterministic: same inputs → same index.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackIndex {
    /// Item ids present in the registry, canonical `ns:path`.
    pub items: Vec<String>,
    /// Tag ids present, canonical `#ns:path`.
    pub tags: Vec<String>,
    /// All item references found in recipes, quests, and tags.
    pub references: Vec<ItemReference>,
    /// Dead-reference findings (resolved=false).
    pub dead_references: Vec<ReferenceFinding>,
    /// Recipe ids indexed (`ns:name`).
    pub recipe_ids: Vec<String>,
    /// Quest node ids indexed (opaque graph ids).
    pub quest_ids: Vec<String>,
}
