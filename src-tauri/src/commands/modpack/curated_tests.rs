//! Tests for the curated-mod filter. The filter is the logic; the CURATED
//! list is content. These lock the trust rule (empty support lists = unknown,
//! not incompatible) so a registry hiccup never silently starves the wizard.

use super::{filter_curated, CuratedMod};
use crate::models::{ModLoader, ModMetadata};

fn meta(slug: &str, loaders: Vec<ModLoader>, versions: Vec<String>) -> ModMetadata {
    ModMetadata {
        mod_id: slug.to_string(),
        slug: slug.to_string(),
        name: "Some Mod".to_string(),
        description: String::new(),
        author: String::new(),
        categories: vec![],
        dependencies: vec![],
        supported_loaders: loaders,
        supported_versions: versions,
        downloads: 0,
        source_url: None,
        issues_url: None,
        documentation_url: None,
        icon: None,
        source: "modrinth".to_string(),
        mismatch: None,
    }
}

fn slugs(mods: &[CuratedMod]) -> Vec<&str> {
    mods.iter().map(|m| m.slug.as_str()).collect()
}

#[test]
fn keeps_picks_that_support_the_pack() {
    let metadata = vec![
        meta("jei", vec![ModLoader::NeoForge, ModLoader::Forge, ModLoader::Fabric], vec!["1.21.1".into(), "1.20.1".into()]),
    ];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(slugs(&out).contains(&"jei"));
}

#[test]
fn drops_a_pick_whose_loader_is_known_incompatible() {
    // Sodium on NeoForge: the metadata proves it Fabric/Quilt only.
    let metadata = vec![meta("sodium", vec![ModLoader::Fabric, ModLoader::Quilt], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(slugs(&out).is_empty(), "known-incompatible pick must not be offered");
}

#[test]
fn drops_a_pick_whose_versions_do_not_cover_mc() {
    let metadata = vec![meta("journeymap", vec![ModLoader::NeoForge], vec!["1.20.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(slugs(&out).is_empty());
}

#[test]
fn keeps_a_pick_with_unknown_support_lists() {
    // Registry metadata missing loader/version info must not be dropped —
    // we can't prove it incompatible (the pack-health trust rule).
    let metadata = vec![meta("jade", vec![], vec![])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(slugs(&out).contains(&"jade"));
}

#[test]
fn drops_unresolvable_picks_silently() {
    // A pick whose metadata fetch failed is absent — not an error, and never
    // offered with a broken install behind it.
    let metadata = vec![meta("jei", vec![ModLoader::NeoForge], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(slugs(&out).contains(&"jei"));
    assert!(!slugs(&out).contains(&"controllable"));
}

#[test]
fn ticked_defaults_survive_filtering() {
    let metadata = vec![meta("jei", vec![ModLoader::NeoForge], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    let jei = out.iter().find(|m| m.slug == "jei").unwrap();
    assert!(jei.ticked, "the go-together default stays pre-checked");
}

#[test]
fn curseforge_pick_resolves_by_its_rekeyed_mod_id() {
    // FTB Quests ships CurseForge-only; the batch path re-keys CF metadata
    // to `curseforge:{id}`, which is exactly the pick's key.
    let mut ftb = meta("ftb-quests", vec![ModLoader::NeoForge], vec!["1.21.1".into()]);
    ftb.mod_id = "curseforge:289412".to_string();
    let out = filter_curated(&[ftb], &ModLoader::NeoForge, "1.21.1");
    let ftb = out.iter().find(|m| m.slug == "ftb-quests").expect("ftb quests resolves");
    assert_eq!(ftb.source, "curseforge");
    assert_eq!(ftb.mod_id, "curseforge:289412");
}

#[test]
fn core_picks_keep_their_core_flag() {
    let metadata = vec![
        meta("jei", vec![ModLoader::NeoForge], vec!["1.21.1".into()]),
        meta("kubejs", vec![ModLoader::NeoForge], vec!["1.21.1".into()]),
    ];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(out.iter().find(|m| m.slug == "kubejs").unwrap().core, "kubejs is core");
    assert!(!out.iter().find(|m| m.slug == "jei").unwrap().core, "jei is not core");
}

#[test]
fn blocked_reason_is_added_by_the_command_not_the_filter() {
    // The pure filter never blocks — blocking is a command-level decision
    // (missing CF key), so the filter's output stays installable-only.
    let metadata = vec![meta("kubejs", vec![ModLoader::NeoForge], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(out.iter().all(|m| m.blocked_reason.is_none()));
}
