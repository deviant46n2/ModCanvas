use super::*;
use std::sync::Arc;
use crate::launcher::LauncherDriver;
use crate::minecraft::ProcLiveness;
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
    let liveness: Arc<dyn InstanceLiveness> = Arc::new(ProcLiveness::default());
    let manager = InstanceManager::new(vec![root_a, root_b], driver, liveness);

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
    let liveness: Arc<dyn InstanceLiveness> = Arc::new(ProcLiveness::default());
    let manager = InstanceManager::new(vec![root_a.clone(), root_b.clone()], driver, liveness);

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

/// A controllable liveness probe: says a game_dir is "running" when the test
/// tells it to. This is the seam test that the original bug lacked — it
/// proves list_instances DERIVES status from liveness rather than trusting
/// the stored wrapper-lifecycle field.
struct FakeLiveness {
    running: std::sync::Mutex<Vec<String>>,
}

impl FakeLiveness {
    fn new() -> Self {
        Self {
            running: std::sync::Mutex::new(Vec::new()),
        }
    }
    fn set_running(&self, game_dir: &str) {
        self.running.lock().unwrap().push(game_dir.to_string());
    }
}

impl InstanceLiveness for FakeLiveness {
    fn is_running(&self, game_dir: &str) -> bool {
        self.running.lock().unwrap().contains(&game_dir.to_string())
    }
}

/// THE regression test for the wrapper-vs-game bug (s19): the stored status
/// said Stopped (wrapper exited code 0 while the game stayed alive), but
/// liveness says the game process exists — list_instances must report
/// Running. Also: a stored Running with no live process must NOT lie.
#[test]
fn list_instances_derives_running_from_liveness_not_stored_status() {
    let temp = tempfile::tempdir().unwrap();
    let root_a = temp.path().join("instances_a");
    let root_b = temp.path().join("instances_b");
    std::fs::create_dir_all(&root_a).unwrap();
    std::fs::create_dir_all(&root_b).unwrap();
    write_prism_instance(&root_a, "Pack A", "1.21.1", "net.neoforged.neoforge");

    let driver: Arc<dyn LauncherDriver> = Arc::new(crate::launcher::PrismLauncherDriver::new());
    let liveness = Arc::new(FakeLiveness::new());
    let manager = InstanceManager::new(vec![root_a.clone(), root_b.clone()], driver, liveness.clone());

    // Instance loads as Stopped (disk scan), no process running yet.
    let stopped = manager.list_instances();
    let pack_a = stopped.iter().find(|i| i.name == "Pack A").unwrap();
    assert_eq!(pack_a.status, InstanceStatus::Stopped);
    let game_dir = pack_a.game_dir.clone();
    // The game process carries the instance ROOT in its cmdline, never the
    // /minecraft subdir (measured 2026-08-08). The fake marks the root.
    // Separator-agnostic: strip the final component, not a literal "/minecraft"
    // (which never matches a Windows "\minecraft" — s65 CI finding).
    let game_path = std::path::Path::new(&game_dir);
    let root = match game_path.file_name().and_then(|n| n.to_str()) {
        Some("minecraft") => game_path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| game_dir.clone()),
        _ => game_dir.clone(),
    };

    // The wrapper exits but the GAME process stays alive (the s19 bug):
    // stored status says Stopped, liveness says running. Derivation must
    // report Running.
    let mut instances = manager.instances.lock().unwrap();
    let inst = instances.iter_mut().find(|i| i.name == "Pack A").unwrap();
    inst.status = InstanceStatus::Stopped; // the lying wrapper-exit write
    drop(instances);
    liveness.set_running(&root);

    let running = manager.list_instances();
    let pack_a_running = running.iter().find(|i| i.name == "Pack A").unwrap();
    assert_eq!(
        pack_a_running.status,
        InstanceStatus::Running,
        "liveness says the game process exists — status must be Running, \
         not the wrapper-exit Stopped the launch flow stored"
    );

    // Reverse: stored Running but the game is gone — must not lie either.
    let mut instances = manager.instances.lock().unwrap();
    let inst = instances.iter_mut().find(|i| i.name == "Pack A").unwrap();
    inst.status = InstanceStatus::Running;
    drop(instances);
    liveness.running.lock().unwrap().clear();

    let stopped_again = manager.list_instances();
    let pack_a_stopped = stopped_again.iter().find(|i| i.name == "Pack A").unwrap();
    assert_eq!(
        pack_a_stopped.status,
        InstanceStatus::Stopped,
        "no live process — status must fall back to Stopped"
    );
}
