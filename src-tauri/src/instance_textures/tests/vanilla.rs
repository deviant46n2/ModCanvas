// Vanilla jar discovery + version-scoping tests (s57/s58).
//
// Cohesion seam: everything about WHERE the vanilla client jar comes from and
// WHICH version's jar is served. Split from tests.rs when the file crossed the
// 300-line soft limit (s58) — the PNG-priority/merge tests stay in tests.rs.

use super::*;
use std::fs;
use std::path::Path;
use tempfile::tempdir;

/// Vanilla-only items resolve from the shared client jar.
#[test]
fn vanilla_jar_textures_are_indexed() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    // Instance-local versions dir acts as the vanilla jar location.
    let vdir = dir.path().join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    // The REAL vanilla model chain (verified against client-1.21.1-extra.jar):
    // item/stone.json has NO own texture — it parents block/stone, which
    // parents cube_all → cube (3D elements). So real stone resolves BAKE,
    // not flat. The fixture is written hermetic so the bake decision doesn't
    // depend on a real vanilla jar found via host HOME layouts (s57).
    // PNG + models in ONE zip pass (append corrupts the archive).
    write_jar_multi(
        &vdir.join("1.21.1.jar"),
        &[
            (format!("assets/minecraft/textures/block/stone.png"), &fake_png(3)),
            (
                "assets/minecraft/models/block/cube.json".to_string(),
                br##"{"textures":{"particle":"#all"},"elements":[{"from":[0,0,0],"to":[16,16,16]}]}"##,
            ),
            (
                "assets/minecraft/models/block/cube_all.json".to_string(),
                br##"{"parent":"minecraft:block/cube","textures":{"all":"#all"}}"##,
            ),
            (
                "assets/minecraft/models/block/stone.json".to_string(),
                br#"{"parent":"minecraft:block/cube_all","textures":{"all":"minecraft:block/stone"}}"#,
            ),
            (
                "assets/minecraft/models/item/stone.json".to_string(),
                br#"{"parent":"minecraft:block/stone"}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(dir.path());
    assert!(idx.contains_key("minecraft:block/stone"));
    assert!(idx.contains_key("minecraft:stone"));
    // Real stone: no own texture on the item model → the chain resolves to a
    // 3D cube → BAKE. The block/stone texture key stays flat (a jar source);
    // the ITEM id is the 3D descriptor (matches the live pack cache).
    let stone = idx.get("minecraft:stone").unwrap();
    assert!(
        stone.starts_with("bake:"),
        "real vanilla stone must bake (item model has no texture), got: {stone}"
    );
    // The block texture key resolves to its jar source (the PNG scan form).
    let block = idx.get("minecraft:block/stone").unwrap();
    assert!(
        block.starts_with("jar:"),
        "block/stone texture must be a jar source, got: {block}"
    );
    assert_eq!(materialized(dir.path(), "minecraft:block/stone"), fake_png(3));
    // Stone is BAKE (not flat), so it must NOT be in the upgradeable set —
    // upgradeable is only for items that resolve FLAT offline (s58).
    let upgrade: Vec<String> = build_engine_upgrade_set(dir.path()).iter().cloned().collect();
    assert!(
        !upgrade.contains(&"minecraft:stone".to_string()),
        "bake items are already engine-driven, not upgradeable, got: {upgrade:?}"
    );
}

/// s58: the engine-upgradeable class — an item whose model carries its OWN
/// s57 regression: Prism/MultiMC keep the vanilla client jar in the launcher's
/// shared `libraries/net/minecraft/client/` dir — a SIBLING of `instances/`,
/// not inside the instance. The texture index used to miss this entirely (its
/// own vanilla discovery only knew instance-local `versions/`), so every
/// Prism-launched pack had an empty vanilla layer and zero vanilla item
/// textures. The walk-up is OS-agnostic: the launcher-relative layout is
/// identical on Linux, Windows and macOS.
#[test]
fn prism_libraries_layout_vanilla_jars_are_indexed() {
    let launcher = tempdir().unwrap();
    // .../PrismLauncher/instances/monster/minecraft
    let instance = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("minecraft");
    fs::create_dir_all(instance.join("mods")).unwrap();
    fs::create_dir_all(instance.join("kubejs").join("assets")).unwrap();
    // Vanilla client jar in the launcher-level libraries dir (the `-extra` jar
    // carries the item textures on 1.21.x; slim/srg carry none).
    let lib = launcher
        .path()
        .join("PrismLauncher")
        .join("libraries")
        .join("net")
        .join("minecraft")
        .join("client")
        .join("1.21.1-20240808.144430");
    fs::create_dir_all(&lib).unwrap();
    write_jar(&lib.join("client-1.21.1-20240808.144430-extra.jar"), "minecraft", "item/paper", &fake_png(4));
    write_jar(&lib.join("client-1.21.1-20240808.144430-slim.jar"), "minecraft", "item/paper", &fake_png(5));
    write_jar(&lib.join("client-1.21.1-20240808.144430-srg.jar"), "minecraft", "item/paper", &fake_png(6));

    // Version source (s58): the shared sweep only accepts the instance's own
    // version — declared by mmc-pack.json, the file Prism itself reads.
    let mmc = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("mmc-pack.json");
    fs::write(
        &mmc,
        r#"{"components":[{"uid":"net.minecraft","cachedVersion":"1.21.1","version":"1.21.1"}]}"#,
    )
    .unwrap();

    let idx = scan_instance_textures(&instance);
    assert!(
        idx.contains_key("minecraft:item/paper"),
        "vanilla item texture must resolve from the Prism libraries layout, got keys: {:?}",
        idx.keys().take(5).collect::<Vec<_>>()
    );
    // The winner is a jar source — and with the s57 `.ftba` check gone, the
    // fake Prism library jar is the only possible vanilla source, so the
    // resolve is deterministic on every host.
    let src = idx.get("minecraft:item/paper").unwrap();
    assert!(src.starts_with("jar:"), "winner must be a jar source, got {src}");
    // Fake jar content must be materializable when nothing shadows it.
    let _ = materialized(&instance, "minecraft:item/paper");
}

/// s58 forever-lock: the shared `libraries/net/minecraft/client/` dir holds
/// jars for EVERY version on the machine. An instance's vanilla layer must
/// only ever contain ITS OWN version's jar — a 1.20.1 jar in a 1.21.1 pack
/// silently resolves wrong models/textures. The instance version comes from
/// `mmc-pack.json` (the authoritative Prism source).
///
/// Tests `find_vanilla_jars` directly (the unit under test) so the assertion
/// is hermetic — a full-scan materialization check would depend on what other
/// jars the host machine happens to have in `~/.minecraft/versions/`.
#[test]
fn prism_libraries_do_not_mix_versions() {
    let launcher = tempdir().unwrap();
    // .../PrismLauncher/instances/monster/minecraft
    let instance = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("minecraft");
    fs::create_dir_all(instance.join("mods")).unwrap();
    fs::create_dir_all(instance.join("kubejs").join("assets")).unwrap();

    // The instance's OWN version (what mmc-pack.json declares).
    let lib211 = launcher
        .path()
        .join("PrismLauncher")
        .join("libraries")
        .join("net")
        .join("minecraft")
        .join("client")
        .join("1.21.1-20240808.144430");
    fs::create_dir_all(&lib211).unwrap();
    write_jar(&lib211.join("client-1.21.1-20240808.144430-extra.jar"), "minecraft", "item/paper", &fake_png(4));

    // A DIFFERENT version's jar sitting in the same shared dir (the poison).
    let lib120 = launcher
        .path()
        .join("PrismLauncher")
        .join("libraries")
        .join("net")
        .join("minecraft")
        .join("client")
        .join("1.20.1-20230612.114412");
    fs::create_dir_all(&lib120).unwrap();
    write_jar(&lib120.join("client-1.20.1-20230612.114412-extra.jar"), "minecraft", "item/paper", &fake_png(6));

    // Authoritative version source: Prism reads this to launch.
    let mmc = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("mmc-pack.json");
    fs::write(
        &mmc,
        r#"{"components":[{"uid":"net.minecraft","cachedVersion":"1.21.1","version":"1.21.1"}]}"#,
    )
    .unwrap();

    let jars = crate::indexer::find_vanilla_jars(&instance);
    let selected: Vec<String> = jars.iter().map(|p| p.to_string_lossy().to_string()).collect();
    assert!(
        selected.iter().any(|p| p.contains("1.21.1-20240808.144430")),
        "the instance's own version jar must be selected, got: {selected:?}"
    );
    assert!(
        !selected.iter().any(|p| p.contains("1.20.1")),
        "wrong-version jar leaked into the vanilla layer, got: {selected:?}"
    );
}

/// s58: when NO version can be resolved (hand-made instance, no mmc-pack.json,
/// no version.json), the shared libraries dir is SKIPPED entirely — never
/// serve wrong data. The layer stays honest: no machine-global vanilla source
/// at all, rather than a guess.
#[test]
fn prism_shared_libraries_skipped_without_resolvable_version() {
    let launcher = tempdir().unwrap();
    let instance = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("minecraft");
    fs::create_dir_all(instance.join("mods")).unwrap();
    fs::create_dir_all(instance.join("kubejs").join("assets")).unwrap();

    // A client jar exists, but NO mmc-pack.json / version.json declares the
    // instance's version — the shared sweep must contribute nothing.
    let lib = launcher
        .path()
        .join("PrismLauncher")
        .join("libraries")
        .join("net")
        .join("minecraft")
        .join("client")
        .join("1.21.1-20240808.144430");
    fs::create_dir_all(&lib).unwrap();
    write_jar(&lib.join("client-1.21.1-20240808.144430-extra.jar"), "minecraft", "item/paper", &fake_png(4));

    let jars = crate::indexer::find_vanilla_jars(&instance);
    let selected: Vec<String> = jars.iter().map(|p| p.to_string_lossy().to_string()).collect();
    assert!(
        selected.iter().all(|p| !p.contains("libraries")),
        "shared libraries must be skipped when the version is unknown, got: {selected:?}"
    );
}

/// Regression: instance-local `versions/` dirs stay usable WITHOUT any version
/// metadata — they are scoped to the instance by construction (s58).
#[test]
fn instance_local_versions_work_without_mmc_pack() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    let vdir = dir.path().join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    write_jar(&vdir.join("1.21.1.jar"), "minecraft", "item/paper", &fake_png(4));

    let idx = scan_instance_textures(dir.path());
    assert!(
        idx.contains_key("minecraft:item/paper"),
        "instance-local versions/ must resolve without version metadata (scoped by construction)"
    );
}
