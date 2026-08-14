//! Tests for the one-click missing-dependency install payload derivation.

use super::install_payload_for;
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
