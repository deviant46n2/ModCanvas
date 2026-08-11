use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::launcher::LauncherDriver;
use crate::models::{InstanceStatus, MinecraftInstance};

use super::instances::InstanceManager;
use super::liveness::InstanceLiveness;
use super::progress::{LaunchProgress, ProgressEmitter};

impl InstanceManager {
    pub fn launch_instance(
        &self,
        emitter: Box<dyn ProgressEmitter>,
        id: &str,
_username: &str,
        min_mem: &str,
        max_mem: &str,
    ) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;

        let game_dir = PathBuf::from(&instance.game_dir);

        // Deploy companion mod to instance
        if let Err(e) = self.deploy_companion_mod(&game_dir, &instance.loader, &instance.mc_version) {
            eprintln!("[ModCanvas] Warning: Failed to deploy companion mod: {e}");
        }

        // Resolve the Prism-compatible folder name:
        // If game_dir ends with "minecraft", it's a Prism instance — parent is the folder name.
        // Otherwise (standalone), the last component of game_dir is the folder name.
        let prism_folder_name = if game_dir.file_name().and_then(|n| n.to_str()) == Some("minecraft") {
            game_dir
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or(&instance.name)
                .to_string()
        } else {
            game_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&instance.name)
                .to_string()
        };

        // Liveness scans the instance ROOT (the java cmdline carries the root
        // via -Djava.library.path=.../natives, never the /minecraft subdir).
        let game_dir_str = game_dir.to_string_lossy();
        let instance_root = game_dir_str
            .strip_suffix("/minecraft")
            .unwrap_or(&game_dir_str)
            .to_string();
        let liveness = self.liveness.clone();

        let id_owned = id.to_string();
        drop(instances);

        let min_mem = min_mem.to_string();
        let max_mem = max_mem.to_string();

        {
            let mut instances = self.instances.lock().unwrap();
            if let Some(inst) = instances.iter_mut().find(|i| i.id == id_owned) {
                inst.status = InstanceStatus::Installing;
            }
        }

        // Clone the Arc for the spawned task so it can update instance status
        let instances_arc = self.instances.clone();

        let driver = self._driver.clone();
        let instances_for_launch = self.instances.clone();
        tokio::spawn(async move {
            let result = do_launch(
                &*emitter,
                driver.as_ref(),
                &instances_for_launch,
                &id_owned,
                &prism_folder_name,
                &min_mem,
                &max_mem,
                liveness.as_ref(),
                &instance_root,
            )
            .await;

            let success = result.is_ok();
            match &result {
                Ok(_) => eprintln!("[ModCanvas] Launch finished for {}", id_owned),
                Err(e) => eprintln!("[ModCanvas] Launch failed for {}: {e}", id_owned),
            }

            // Update status via the shared instances list
            if let Ok(mut insts) = instances_arc.lock() {
                if let Some(inst) = insts.iter_mut().find(|i| i.id == id_owned) {
                    if success {
                        inst.status = InstanceStatus::Stopped;
                    } else {
                        inst.status = InstanceStatus::Crashed;
                    }
                }
            }
        });

        Ok(())
    }
}

/// Grace window for the Prism-refusal check: a stale Prism process (workaround
/// #8) swallows the single-instance IPC and the wrapper exits 0 immediately
/// with no game process starting. Real launches reach the game well within
/// this window; a slow first launch just keeps the wrapper alive.
const LAUNCH_GRACE: Duration = Duration::from_secs(20);
const LIVENESS_POLL: Duration = Duration::from_millis(250);

/// `pub(super)`: the sibling `launch_tests` module drives the refusal
/// detection against fake drivers/liveness (s44).
pub(super) async fn do_launch(
    emitter: &dyn ProgressEmitter,
    driver: &dyn LauncherDriver,
    instances: &Arc<Mutex<Vec<MinecraftInstance>>>,
    instance_id: &str,
    prism_folder_name: &str,
    min_mem: &str,
    max_mem: &str,
    liveness: &dyn InstanceLiveness,
    instance_root: &str,
) -> Result<(), String> {
    eprintln!(
        "[ModCanvas] Launching '{}' via Prism Launcher",
        prism_folder_name
    );
    eprintln!("[ModCanvas] Memory: min={}, max={}", min_mem, max_mem);

    // Emit: preparing
    emitter.emit_progress(LaunchProgress {
        phase: "preparing".into(),
        message: format!("Preparing to launch '{}'...", prism_folder_name),
        bytes: None,
        total: None,
    });

    // Emit: spawning
    emitter.emit_progress(LaunchProgress {
        phase: "launching".into(),
        message: format!("Launching '{}' via Prism...", prism_folder_name),
        bytes: None,
        total: None,
    });

    // Spawn the Prism Launcher process — no working_dir needed,
    // Prism finds the instance by name in its instances directory
    let mut child = driver.spawn_launch(prism_folder_name, None)?;
    let pid = child.id().unwrap_or(0);

    // The child is up: mark the instance Running so the UI can distinguish
    // "launched from ModCanvas, game alive, companion missing" from plain
    // offline. Cleared back to Stopped/Crashed when the child exits below.
    if let Ok(mut insts) = instances.lock() {
        if let Some(inst) = insts.iter_mut().find(|i| i.id == instance_id) {
            inst.status = InstanceStatus::Running;
        }
    }

    eprintln!("[ModCanvas] Prism Launcher spawned with PID {}", pid);

    emitter.emit_progress(LaunchProgress {
        phase: "running".into(),
        message: format!("Game running (PID {})", pid),
        bytes: None,
        total: None,
    });

    // Prism-refusal detection (s44, workaround #8): a stale Prism process
    // holds the single-instance lock, the spawn forwards to it and the
    // wrapper exits 0 IMMEDIATELY — no game process ever starts. Distinguish
    // that from a normal launch by liveness: a real launch has a live game
    // process carrying the instance root in its cmdline. Liveness wins over
    // the exit code, because a normal hand-off can also see the wrapper exit
    // 0 while the game keeps running (liveness.rs). Never report "Game
    // exited (code 0)" as a success when the game never started.
    let deadline = Instant::now() + LAUNCH_GRACE;
    loop {
        if liveness.is_running(instance_root) {
            break; // game is up — normal path, wait for the wrapper below.
        }
        match child.try_wait().map_err(|e| format!("Process error: {e}"))? {
            Some(status) if status.code() == Some(0) => {
                return Err(format!(
                    "Prism exited immediately (code 0) and no game process started. \
                     A stale Prism process may be holding the instance — close Prism \
                     completely and try again."
                ));
            }
            Some(status) => {
                // Non-zero exit within the grace window — a real failure, not
                // a refusal; report it as the launch result.
                let msg = match status.code() {
                    Some(code) => format!("Game exited (code {})", code),
                    None => "Game exited".into(),
                };
                emitter.emit_progress(LaunchProgress {
                    phase: "done".into(),
                    message: msg.clone(),
                    bytes: None,
                    total: None,
                });
                return Err(msg);
            }
            None => {
                if Instant::now() >= deadline {
                    break; // wrapper still alive after grace — normal slow start.
                }
                tokio::time::sleep(LIVENESS_POLL).await;
            }
        }
    }

    // Wait for the child process to exit (non-blocking)
    let exit_status = child.wait().await.map_err(|e| format!("Process error: {e}"))?;

    let msg = match exit_status.code() {
        Some(code) => format!("Game exited (code {})", code),
        None => "Game exited".into(),
    };
    eprintln!("[ModCanvas] {}", msg);

    emitter.emit_progress(LaunchProgress {
        phase: "done".into(),
        message: msg,
        bytes: None,
        total: None,
    });

    Ok(())
}
