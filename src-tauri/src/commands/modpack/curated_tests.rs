//! Tests for the curated-mod filter. The filter is the logic; the CURATED
//! list is content. These lock the trust rule (empty support lists = unknown,
//! not incompatible) so a registry hiccup never silently starves the wizard.

use super::{blocked, cf_block_reason, filter_curated, version_compatible, CURATED, CuratedMod};
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
fn filter_tags_modrinth_picks_as_modrinth() {
    // The CF pick (curseforge:289412) never flows through filter_curated —
    // list_curated_mods excludes curseforge: keys from the Modrinth batch and
    // resolves the CF pick separately (resolve_cf_pick). The pure filter only
    // ever tags Modrinth picks, and the one-click installer is Modrinth-only.
    let metadata = vec![meta("kubejs", vec![ModLoader::NeoForge], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    let kubejs = out.iter().find(|m| m.slug == "kubejs").unwrap();
    assert_eq!(kubejs.source, "modrinth");
    assert_eq!(kubejs.mod_id, "kubejs", "modrinth id is the slug, no re-keying");
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
    // (failed fetch, version/loader mismatch), so the filter's output stays
    // clean.
    let metadata = vec![meta("kubejs", vec![ModLoader::NeoForge], vec!["1.21.1".into()])];
    let out = filter_curated(&metadata, &ModLoader::NeoForge, "1.21.1");
    assert!(out.iter().all(|m| m.blocked_reason.is_none()));
}

#[test]
fn cf_block_reason_maps_403_to_the_key_message() {
    // A 403 means the stored key was rejected — the reason must say so in
    // beginner words, not echo the raw HTTP status (s48 walkthrough finding).
    let reason = cf_block_reason("CurseForge API returned 403 Forbidden");
    assert!(reason.contains("rejected your API key"), "403 maps to the key message: {reason}");
    assert!(reason.contains("Settings"), "points at the fix: {reason}");

    let other = cf_block_reason("CurseForge API returned 500 Internal Server Error");
    assert!(other.contains("metadata fetch failed"), "non-403 keeps the generic message: {other}");
}

#[test]
fn blocked_picks_carry_the_manual_download_page() {
    // The FTB Quests pick declares its project page so the blocked box can
    // link it — the manual jar-download fallback for users who skip Prism
    // (s48 lineage). Installs always execute in Prism (s54); the page is the
    // belt-and-suspenders path.
    let pick = CURATED.iter().find(|c| c.key == "curseforge:289412").unwrap();
    let blocked_row = blocked(pick, "metadata fetch failed");
    assert_eq!(
        blocked_row.page_url.as_deref(),
        Some("https://www.curseforge.com/minecraft/mc-mods/ftb-quests")
    );
    // Modrinth picks don't declare a page — they install in-app.
    let modrinth_pick = CURATED.iter().find(|c| c.key == "kubejs").unwrap();
    assert_eq!(blocked(modrinth_pick, "x").page_url, None);
}

#[test]
fn version_compatible_exact_match() {
    assert!(version_compatible("1.21.1", "1.21.1"));
}

#[test]
fn version_compatible_major_prefix_covers_patch() {
    assert!(version_compatible("1.21", "1.21.1"));
    assert!(version_compatible("1.20", "1.20.5"));
}

#[test]
fn version_compatible_reversed_or_unrelated_versions_are_not_compatible() {
    assert!(!version_compatible("1.21.1", "1.21"));
    assert!(!version_compatible("1.21", "1.20.1"));
    assert!(!version_compatible("1.19", "1.21.1"));
}
