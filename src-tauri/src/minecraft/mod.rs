pub use crate::models::{InstanceStatus, MinecraftInstance};

mod companion;
mod instances;
mod kubejs;
mod launch;
mod loader;
mod prism;
mod progress;

pub use companion::deploy_companion_mod_to_dir;
pub use instances::{InstanceManager, InstanceMetadata};
pub use kubejs::{detect_kubejs_scripts, get_all_kubejs_scripts, KubeJSScript, KubeJSScriptDir};
pub use loader::resolve_loader_version;
pub use progress::{LaunchProgress, NullProgressEmitter, ProgressEmitter};

#[cfg(test)]
mod tests;
