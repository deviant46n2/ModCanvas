//! Tests for the one-click missing-dependency install payload derivation and
//! the dep-satisfaction identity rule.

use std::collections::HashSet;

use super::{dep_is_satisfied, install_payload_for};
use crate::models::ModMetadata;

fn meta(source: &str, mod_id: &str) -> ModMetadata {
    ModMetadata {
        mod_id: mod_id.to_string(),
        slug: "the-slug".to_string(),
        name: "The Mod".to_string(),
        description: String::new(),
        author: String::new(),
        categories: vec![],
        dependencies: vec![],
        supported_loaders: vec![],
        supported_versions: vec![],
        downloads: 0,
        source_url: None,
        issues_url: None,
        documentation_url: None,
        icon: None,
        source: source.to_string(),
        mismatch: None,
    }
}

#[test]
fn modrinth_dep_carries_slug_as_install_id() {
    let payload = install_payload_for(&meta("modrinth", "sodium")).expect("modrinth resolves");
    assert_eq!(payload.mod_id, "sodium");
    assert_eq!(payload.slug, "the-slug");
    assert_eq!(payload.name, "The Mod");
}

#[test]
fn curseforge_dep_gets_no_payload() {
    // PRISM-LEAN s54: the one-click installer is Modrinth-only. A CF dep must
    // not offer a button the app can't back — it installs through Prism.
    assert!(install_payload_for(&meta("curseforge", "curseforge:394468")).is_none());
    assert!(install_payload_for(&meta("curseforge", "not-a-number")).is_none());
}

#[test]
fn unknown_source_gets_no_payload() {
    // The check tolerates failed metadata fetches; an issue whose dep has no
    // registry source must not offer an install button that would lie.
    assert!(install_payload_for(&meta("", "mystery")).is_none());
}

fn ids_of(items: &[&str]) -> HashSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn dep_is_satisfied_by_matching_row_id() {
    // A dep referenced by the same id an installed row carries — the CF
    // re-keyed form (`curseforge:{id}`) matches directly.
    let ids = ids_of(&["curseforge:394468"]);
    assert!(dep_is_satisfied("curseforge:394468", &ids, None));
}

#[test]
fn dep_is_satisfied_when_resolved_metadata_matches_an_installed_mod() {
    // The s54 live bug: one-click KubeJS installed Rhino and "requires Rhino"
    // stayed. The installed row says "rhino" (jar id) while the dep reference
    // says the numeric Modrinth project id — the dep is satisfied because its
    // resolved metadata's slug is installed.
    let ids = ids_of(&["rhino"]);
    let mut dep_meta = meta("modrinth", "4028181");
    dep_meta.slug = "rhino".to_string();
    assert!(dep_is_satisfied("4028181", &ids, Some(&dep_meta)));
}

#[test]
fn dep_is_not_satisfied_when_nothing_matches() {
    let ids = ids_of(&["kubejs"]);
    let mut dep_meta = meta("modrinth", "4028181");
    dep_meta.slug = "rhino".to_string();
    assert!(!dep_is_satisfied("4028181", &ids, Some(&dep_meta)));
    // No resolved metadata and no id match — a genuinely missing dep.
    assert!(!dep_is_satisfied("4028181", &ids, None));
}
