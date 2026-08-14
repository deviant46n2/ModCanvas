use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::{Child, Command};

/// Trait abstracting launcher execution. Implementations handle the OS-level
/// process orchestration for launching Minecraft instances.
pub trait LauncherDriver: Send + Sync {
    /// Detect default instance root directories for this launcher.
    fn default_instance_roots(&self) -> Vec<PathBuf>;

    /// Return the binary name or path used to invoke this launcher.
    fn binary_name(&self) -> &str;

    /// Build the CLI arguments to launch a named instance.
    fn launch_args(&self, instance_name: &str) -> Vec<String>;

    /// Spawn the launcher process in non-blocking background mode.
    fn spawn_launch(
        &self,
        instance_name: &str,
        working_dir: Option<&std::path::Path>,
    ) -> Result<Child, String>;

    /// Resolve every existing, de-duplicated instance root, in priority
    /// order (primary first). The app scans ALL of them so instances spread
    /// across several Prism installs (e.g. a native build and a Flatpak
    /// build) are all visible instead of only whichever root has the most
    /// subdirectories.
    fn resolve_instance_roots(&self) -> Vec<PathBuf> {
        let mut seen = std::collections::HashSet::new();
        self.default_instance_roots()
            .into_iter()
            .filter(|p| p.exists())
            .filter(|p| {
                let key = p.canonicalize().unwrap_or_else(|_| p.clone());
                seen.insert(key)
            })
            .collect()
    }

    /// Given a custom override path, resolve the effective primary instance
    /// root (used for creating new instances).
    fn resolve_instance_root(&self, custom_path: Option<&str>) -> PathBuf {
        if let Some(p) = custom_path {
            return PathBuf::from(p);
        }
        // Prefer the directory that actually contains instance subdirs,
        // not just an empty data dir that happens to exist.
        self.resolve_instance_roots()
            .into_iter()
            .max_by_key(|p| {
                std::fs::read_dir(p)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|e| e.path().is_dir())
                    .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                    .count()
            })
            .unwrap_or_else(|| {
                dirs_next::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("PrismLauncher")
                    .join("instances")
            })
    }

    /// List discovered instance directories under a root.
    fn list_instances(&self, root: &std::path::Path) -> Vec<PathBuf> {
        if !root.exists() {
            return Vec::new();
        }
        std::fs::read_dir(root)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .map(|e| e.path())
            .collect()
    }
}

/// Prism Launcher driver — interacts with Prism via CLI and file I/O.
pub struct PrismLauncherDriver;

impl PrismLauncherDriver {
    pub fn new() -> Self {
        Self
    }

    /// Shared spawn plumbing for every Prism invocation: flatpak env
    /// passthrough + detached stdio. `args` are already fully formed
    /// (including the `flatpak run org.prismlauncher.PrismLauncher` prefix
    /// when the flatpak binary is in use).
    fn spawn_prism(
        &self,
        args: &[String],
        working_dir: Option<&std::path::Path>,
    ) -> Result<Child, String> {
        let binary = self.binary_name();

        eprintln!(
            "[ModCanvas] Spawning Prism: {} {} (workdir={:?})",
            binary,
            args.join(" "),
            working_dir
        );

        let mut cmd = Command::new(binary);
        cmd.args(args);

        // Set environment for Flatpak sandbox isolation if applicable
        // (flatpak-spawn --host also forwards display vars, explicit passthrough
        // is belt-and-suspenders for the host app + flatpak-Prism case)
        if cfg!(target_os = "linux") && (binary == "flatpak" || binary == "flatpak-spawn") {
            cmd.env("PULSE_SERVER", std::env::var("PULSE_SERVER").unwrap_or_default());
            // Pass through Wayland/X11 display
            if let Ok(display) = std::env::var("DISPLAY") {
                cmd.env("DISPLAY", display);
            }
            if let Ok(wayland) = std::env::var("WAYLAND_DISPLAY") {
                cmd.env("WAYLAND_DISPLAY", wayland);
            }
        }

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        // Non-blocking: we don't wait on stdin/stdout/stderr
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

        cmd.spawn().map_err(|e| format!("Failed to spawn Prism Launcher: {e}"))
    }

    /// Open Prism's main window.
    pub fn open_launcher(&self) -> Result<Child, String> {
        self.spawn_prism(&[], None)
    }

    /// Open Prism focused on a named instance (`--show <id>`) — the
    /// PRISM-LEAN handoff surface. s54 fix: the commands previously
    /// hardcoded `prismlauncher` on PATH and silently died on Flatpak-only
    /// systems; this goes through the same binary resolution as launch.
    pub fn show_instance(&self, instance_name: &str) -> Result<Child, String> {
        self.spawn_prism(&show_instance_args(self.binary_name(), instance_name), None)
    }
}

/// CLI arguments to focus Prism on an instance, for either binary form.
/// Pure + tested so the flatpak form can't regress.
fn show_instance_args(binary: &str, instance_name: &str) -> Vec<String> {
    let mut args = prism_invoke_prefix(binary);
    args.push("--show".into());
    args.push(instance_name.into());
    args
}

impl Default for PrismLauncherDriver {
    fn default() -> Self {
        Self::new()
    }
}

impl LauncherDriver for PrismLauncherDriver {
    fn default_instance_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        let binary = self.binary_name();

        if let Some(home) = dirs_next::home_dir() {
            roots.extend(home_instance_roots(binary, &home));
        }

        if let Some(data_local) = dirs_next::data_local_dir() {
            // Windows / fallback
            roots.push(data_local.join("PrismLauncher").join("instances"));
        }

        roots
    }

    fn binary_name(&self) -> &str {
        // Sandboxed (flatpak) app first: host binaries are unreachable, the
        // only escape is flatpak-spawn --host.
        if running_inside_sandbox() {
            "flatpak-spawn"
        // Prefer native install over Flatpak
        } else if which_prismlauncher() {
            "prismlauncher"
        } else if cfg!(target_os = "linux") && is_flatpak_installed() {
            "flatpak"
        } else {
            "prismlauncher"
        }
    }

    fn launch_args(&self, instance_name: &str) -> Vec<String> {
        let mut args = prism_invoke_prefix(self.binary_name());
        args.push("--launch".into());
        args.push(instance_name.into());
        args
    }

    fn spawn_launch(
        &self,
        instance_name: &str,
        working_dir: Option<&std::path::Path>,
    ) -> Result<Child, String> {
        let args = self.launch_args(instance_name);
        self.spawn_prism(&args, working_dir)
    }
}

/// Home-relative instance roots in creation-priority order for a binary form.
/// The FIRST root is where new instances are created — it MUST match the
/// Prism the driver will actually spawn, because Prism installs are walled
/// gardens: the flatpak Prism cannot see the native root (its manifest grants
/// only its own sandbox home). Creating into the native root while spawning
/// flatpak Prism makes the new instance invisible (s55 live: an instance the
/// app created vanished from the flatpak Prism the user actually runs).
/// Pure + tested so the ordering can't regress across the binary forms.
fn home_instance_roots(binary: &str, home: &std::path::Path) -> Vec<PathBuf> {
    let native = home.join(".local/share/PrismLauncher/instances");
    let flatpak = home
        .join(".var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances");
    if binary == "flatpak" || binary == "flatpak-spawn" {
        vec![flatpak, native]
    } else {
        vec![native, flatpak]
    }
}

/// Check if Prism is installed via Flatpak on this system.
fn is_flatpak_installed() -> bool {
    std::process::Command::new("flatpak")
        .args(["list", "--app"])
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .contains("org.prismlauncher.PrismLauncher")
        })
        .unwrap_or(false)
}

/// Detect whether ModCanvas ITSELF runs inside a flatpak sandbox.
/// When sandboxed, host binaries (`prismlauncher`, `flatpak`) are unreachable;
/// the driver must escape via `flatpak-spawn --host` (requires the
/// org.freedesktop.Flatpak talk-name in the manifest). Markers verified
/// inside the sandbox (s55): `container=flatpak` + `FLATPAK_ID` are set.
fn running_inside_sandbox() -> bool {
    std::env::var("container").is_ok() && std::env::var("FLATPAK_ID").is_ok()
}

/// Invocation prefix for reaching Prism, per binary form:
/// - native: `prismlauncher` directly (no prefix)
/// - host app + flatpak Prism: `flatpak run org.prismlauncher.PrismLauncher`
/// - sandboxed app: `flatpak-spawn --host flatpak run …` (escapes the sandbox,
///   then invokes the host's flatpak CLI)
fn prism_invoke_prefix(binary: &str) -> Vec<String> {
    match binary {
        "flatpak" => vec!["run".into(), "org.prismlauncher.PrismLauncher".into()],
        "flatpak-spawn" => vec![
            "--host".into(),
            "flatpak".into(),
            "run".into(),
            "org.prismlauncher.PrismLauncher".into(),
        ],
        _ => Vec::new(),
    }
}

/// Check if native `prismlauncher` binary is available in PATH.
fn which_prismlauncher() -> bool {
    std::process::Command::new("which")
        .arg("prismlauncher")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Configuration for custom launcher paths (stored in settings).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LauncherConfig {
    /// Custom Prism Launcher binary path (overrides auto-detection).
    pub custom_binary: Option<String>,
    /// Custom instance root directory (overrides OS defaults).
    pub custom_instance_root: Option<String>,
}

impl LauncherConfig {
    /// Get the effective binary path.
    pub fn effective_binary(&self, driver: &dyn LauncherDriver) -> String {
        self.custom_binary
            .clone()
            .unwrap_or_else(|| driver.binary_name().to_string())
    }

    /// Get the effective instance root.
    pub fn effective_root(&self, driver: &dyn LauncherDriver) -> PathBuf {
        driver.resolve_instance_root(self.custom_instance_root.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prism_default_roots() {
        let driver = PrismLauncherDriver::new();
        let roots = driver.default_instance_roots();
        // Should have at least one root
        assert!(!roots.is_empty());
        // All roots should end with "instances"
        for root in &roots {
            assert_eq!(root.file_name().unwrap(), "instances");
        }
    }

    #[test]
    fn test_launch_args() {
        let driver = PrismLauncherDriver::new();
        // On Linux with flatpak, args differ from native
        let args = driver.launch_args("MyPack");
        assert!(args.contains(&"--launch".to_string()));
        assert!(args.contains(&"MyPack".to_string()));
    }

    #[test]
    fn test_show_instance_args_native_and_flatpak() {
        // Native form: `--show <id>`
        let native = show_instance_args("prismlauncher", "MyPack");
        assert_eq!(native, vec!["--show", "MyPack"]);
        // Flatpak form: `flatpak run … --show <id>` — the s54 regression the
        // handoff buttons hit on Flatpak-only systems.
        let flatpak = show_instance_args("flatpak", "MyPack");
        assert_eq!(
            flatpak,
            vec![
                "run",
                "org.prismlauncher.PrismLauncher",
                "--show",
                "MyPack",
            ]
        );
    }

    #[test]
    fn test_show_instance_args_sandboxed_app() {
        // App running INSIDE a flatpak sandbox (s55): host binaries are
        // unreachable; escape via `flatpak-spawn --host flatpak run …`.
        let sandbox = show_instance_args("flatpak-spawn", "MyPack");
        assert_eq!(
            sandbox,
            vec![
                "--host",
                "flatpak",
                "run",
                "org.prismlauncher.PrismLauncher",
                "--show",
                "MyPack",
            ]
        );
    }

    #[test]
    fn test_invoke_prefix_forms() {
        assert_eq!(prism_invoke_prefix("prismlauncher"), Vec::<String>::new());
        assert_eq!(
            prism_invoke_prefix("flatpak"),
            vec!["run", "org.prismlauncher.PrismLauncher"]
        );
        assert_eq!(
            prism_invoke_prefix("flatpak-spawn"),
            vec!["--host", "flatpak", "run", "org.prismlauncher.PrismLauncher"]
        );
    }

    #[test]
    fn test_home_root_priority_matches_binary_form() {
        let home = std::path::PathBuf::from("/home/test");
        let native_root = home.join(".local/share/PrismLauncher/instances");
        let flatpak_root = home
            .join(".var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances");

        // Native form: native root is the primary (creation) root.
        let native = home_instance_roots("prismlauncher", &home);
        assert_eq!(native[0], native_root);
        assert_eq!(native[1], flatpak_root);

        // Flatpak forms: the flatpak root is primary — the walled-garden rule.
        for form in ["flatpak", "flatpak-spawn"] {
            let roots = home_instance_roots(form, &home);
            assert_eq!(roots[0], flatpak_root, "{form} must create into the flatpak root");
            assert_eq!(roots[1], native_root);
        }
    }
}
