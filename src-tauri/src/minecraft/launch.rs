use std::path::PathBuf;

use crate::launcher::LauncherDriver;
use crate::models::InstanceStatus;

use super::instances::InstanceManager;
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
        tokio::spawn(async move {
            let result = do_launch(
                &*emitter,
                driver.as_ref(),
                &prism_folder_name,
                &min_mem,
                &max_mem,
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

async fn do_launch(
    emitter: &dyn ProgressEmitter,
    driver: &dyn LauncherDriver,
    prism_folder_name: &str,
    min_mem: &str,
    max_mem: &str,
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

    eprintln!("[ModCanvas] Prism Launcher spawned with PID {}", pid);

    emitter.emit_progress(LaunchProgress {
        phase: "running".into(),
        message: format!("Game running (PID {})", pid),
        bytes: None,
        total: None,
    });

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
