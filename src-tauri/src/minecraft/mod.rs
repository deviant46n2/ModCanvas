pub use crate::models::{InstanceStatus, MinecraftInstance};

mod companion;
mod instances;
mod kubejs;
mod launch;
mod liveness;
mod loader;
mod prism;
mod progress;

pub use companion::{
    companion_deploy_status, deploy_companion_mod_to_dir, resolve_companion_source_jar,
    CompanionDeployStatus,
};
pub use instances::{InstanceManager, InstanceMetadata};
pub use kubejs::{detect_kubejs_scripts, get_all_kubejs_scripts, KubeJSScript, KubeJSScriptDir};
pub use liveness::{InstanceLiveness, ProcLiveness};
pub use loader::resolve_loader_version;
pub use progress::{LaunchProgress, NullProgressEmitter, ProgressEmitter};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod launch_tests;
