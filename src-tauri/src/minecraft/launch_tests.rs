// Launch flow tests (s44) — extracted from launch.rs to satisfy the 300-line
// rule (s36 split pattern). The refusal detection is the P2-HOTSWAP launch
// surface: a wrapper that exits 0 with no game process is the workaround #8
// stale-Prism signature; liveness (not exit code) discriminates a refusal
// from a normal hand-off.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::process::{Child, Command};

use super::launch::do_launch;
use crate::launcher::LauncherDriver;
use crate::models::MinecraftInstance;
use crate::minecraft::liveness::InstanceLiveness;
use crate::minecraft::progress::{LaunchProgress, ProgressEmitter};

/// A driver that spawns a real `sleep` child (a stand-in for the Prism
/// wrapper) and records the launch args.
struct TestDriver {
    sleep_secs: u64,
}

impl LauncherDriver for TestDriver {
    fn default_instance_roots(&self) -> Vec<PathBuf> {
        vec![PathBuf::from("/tmp")]
    }
    fn binary_name(&self) -> &str {
        "sleep"
    }
    fn launch_args(&self, _instance_name: &str) -> Vec<String> {
        vec![self.sleep_secs.to_string()]
    }
    fn spawn_launch(
        &self,
        _instance_name: &str,
        _working_dir: Option<&std::path::Path>,
    ) -> Result<Child, String> {
        Command::new("sleep")
            .arg(self.sleep_secs.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))
    }
}

/// Liveness stub: the game process never appears — the refusal signature.
struct NoGameLiveness;
impl InstanceLiveness for NoGameLiveness {
    fn is_running(&self, _game_dir: &str) -> bool {
        false
    }
}

/// Liveness stub: the game process appears immediately (normal launch).
struct GameUpLiveness;
impl InstanceLiveness for GameUpLiveness {
    fn is_running(&self, _game_dir: &str) -> bool {
        true
    }
}

struct NullEmitter;
impl ProgressEmitter for NullEmitter {
    fn emit_progress(&self, _p: LaunchProgress) {}
}

fn no_instances() -> Arc<Mutex<Vec<MinecraftInstance>>> {
    Arc::new(Mutex::new(Vec::new()))
}

#[tokio::test]
async fn wrapper_exit_zero_with_no_game_is_refusal() {
    // `sleep 1` exits 0 quickly; liveness says no game ever started —
    // exactly the stale-Prism swallow (workaround #8). Must return the
    // specific refusal error, never "Game exited (code 0)".
    let driver = TestDriver { sleep_secs: 1 };
    let result = do_launch(
        &NullEmitter,
        &driver,
        &no_instances(),
        "i1",
        "Monster",
        "2G",
        "4G",
        &NoGameLiveness,
        "/tmp/instance-root",
    )
    .await;
    let err = result.expect_err("refusal must fail the launch");
    assert!(
        err.contains("exited immediately") && err.contains("close Prism"),
        "got: {err}"
    );
}

#[tokio::test]
async fn game_up_within_grace_is_normal_launch() {
    // Liveness true immediately: the game is up, the wrapper exit is the
    // normal hand-off (liveness.rs). Must NOT be reported as a refusal.
    let driver = TestDriver { sleep_secs: 1 };
    let result = do_launch(
        &NullEmitter,
        &driver,
        &no_instances(),
        "i1",
        "Monster",
        "2G",
        "4G",
        &GameUpLiveness,
        "/tmp/instance-root",
    )
    .await;
    assert!(result.is_ok(), "normal launch must succeed: {:?}", result.err());
}

#[tokio::test]
async fn wrapper_still_alive_after_grace_waits_normally() {
    // `sleep 30` outlives the 20s grace window; liveness false the whole
    // time (no game yet — slow first launch). The loop must time out and
    // fall through to the normal wait, then succeed on the exit.
    let driver = TestDriver { sleep_secs: 30 };
    let result = do_launch(
        &NullEmitter,
        &driver,
        &no_instances(),
        "i1",
        "Monster",
        "2G",
        "4G",
        &NoGameLiveness,
        "/tmp/instance-root",
    )
    .await;
    assert!(result.is_ok(), "slow start must not be a refusal: {:?}", result.err());
}
