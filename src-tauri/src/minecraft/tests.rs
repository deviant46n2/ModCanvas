use super::*;
use std::sync::Arc;
use crate::launcher::LauncherDriver;
use uuid::Uuid;

fn write_prism_instance(root: &std::path::Path, name: &str, mc: &str, loader: &str) {
    let dir = root.join(name);
    std::fs::create_dir_all(dir.join("minecraft")).unwrap();
    std::fs::write(
        dir.join("instance.cfg"),
        format!("InstanceType=OneSix\nname={name}\n"),
    )
    .unwrap();
    std::fs::write(
        dir.join("mmc-pack.json"),
        format!(
            r#"{{"components":[
                {{"uid":"net.minecraft","version":"{mc}"}},
                {{"uid":"{loader}","version":"9.9.9"}}
            ]}}"#
        ),
    )
    .unwrap();
}

/// Instances spread across several roots (native + Flatpak Prism) must
/// all be discovered and merged, not just the ones in one root.    #[test]
fn scans_all_instance_roots() {
    let temp = std::env::temp_dir().join(format!("modcanvas_inst_{}", Uuid::new_v4()));
    let root_a = temp.join("a");
    let root_b = temp.join("b");
    std::fs::create_dir_all(&root_a).unwrap();
    std::fs::create_dir_all(&root_b).unwrap();

    write_prism_instance(&root_a, "Pack A", "1.20.1", "net.minecraftforge");
    write_prism_instance(&root_a, "Pack B", "1.21.1", "net.fabricmc.fabric");
    write_prism_instance(&root_b, "Pack C", "26.2", "net.fabricmc.fabric-loader");

    let driver: Arc<dyn LauncherDriver> = Arc::new(crate::launcher::PrismLauncherDriver::new());
    let manager = InstanceManager::new(vec![root_a, root_b], driver);

    let mut names: Vec<String> = manager
        .list_instances()
        .into_iter()
        .map(|i| i.name)
        .collect();
    names.sort();
    assert_eq!(names, vec!["Pack A", "Pack B", "Pack C"]);

    let _ = std::fs::remove_dir_all(&temp);
}

/// The primary (first) root is used when creating new instances.
#[test]
fn create_instance_uses_primary_root() {
    let temp = std::env::temp_dir().join(format!("modcanvas_inst_{}", Uuid::new_v4()));
    let root_a = temp.join("a");
    let root_b = temp.join("b");
    std::fs::create_dir_all(&root_a).unwrap();
    std::fs::create_dir_all(&root_b).unwrap();

    let driver: Arc<dyn LauncherDriver> = Arc::new(crate::launcher::PrismLauncherDriver::new());
    let manager = InstanceManager::new(vec![root_a.clone(), root_b.clone()], driver);

    manager
        .create_instance("My New Pack", "1.20.1", "Forge", Some("47.0.0"))
        .unwrap();

    assert!(root_a.join("My New Pack").exists(), "instance created under primary root");
    assert!(!root_b.join("My New Pack").exists(), "instance NOT created under secondary root");

    let _ = std::fs::remove_dir_all(&temp);
}

/// The deploy matrix targets 1.21.1 NeoForge only (todo.md Phase 3): every
/// archived loader is rejected with a clear message before any jar lookup.
#[test]
fn deploy_matrix_is_neoforge_only() {
    let dir = tempfile::tempdir().unwrap();
    let game_dir = dir.path().join("game");

    for loader in ["forge", "fabric", "quilt", "neoforge1.20"] {
        let err = deploy_companion_mod_to_dir(&game_dir, loader, "1.20.1").unwrap_err();
        assert!(
            err.contains("NeoForge only"),
            "loader `{loader}` must be rejected, got: {err}"
        );
    }

    // NeoForge stays in the matrix: it must either deploy or fail only on a
    // missing built jar — never on the loader being rejected.
    let res = deploy_companion_mod_to_dir(&game_dir, "neoforge", "1.21.1");
    match res {
        Ok(()) => {}
        Err(e) => assert!(e.contains("not found"), "neoforge must not be rejected: {e}"),
    }
}
