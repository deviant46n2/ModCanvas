use std::path::PathBuf;

/// KubeJS script directory structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KubeJSScriptDir {
    pub path: PathBuf,
    pub script_type: String, // "startup", "server", "client", "legacy"
    pub scripts: Vec<KubeJSScript>,
}

/// Individual KubeJS script file
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KubeJSScript {
    pub name: String,
    pub path: PathBuf,
    pub content: String,
    pub size: u64,
}

/// Detect KubeJS script directories in an instance
pub fn detect_kubejs_scripts(game_dir: &PathBuf) -> Vec<KubeJSScriptDir> {
    let mut script_dirs = Vec::new();
    let kubejs_root = game_dir.join("kubejs");
    
    if !kubejs_root.exists() {
        return script_dirs;
    }
    
    // KubeJS script directories and their types
    let script_types = [
        ("startup_scripts", "startup"),
        ("server_scripts", "server"),
        ("client_scripts", "client"),
        ("scripts", "legacy"), // Old KubeJS 5.x style
    ];
    
    for (dir_name, script_type) in script_types {
        let script_dir = kubejs_root.join(dir_name);
        if script_dir.exists() && script_dir.is_dir() {
            let mut scripts = Vec::new();
            
            // Recursively find all .js files
            for entry in walkdir::WalkDir::new(&script_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "js") {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let name = path.strip_prefix(&script_dir).unwrap_or(path).to_string_lossy().to_string();
                        scripts.push(KubeJSScript {
                            name,
                            path: path.to_path_buf(),
                            content,
                            size: entry.metadata().map(|m| m.len()).unwrap_or(0),
                        });
                    }
                }
            }
            
            if !scripts.is_empty() {
                script_dirs.push(KubeJSScriptDir {
                    path: script_dir,
                    script_type: script_type.to_string(),
                    scripts,
                });
            }
        }
    }
    
    script_dirs
}

/// Get all KubeJS scripts across all script directories
pub fn get_all_kubejs_scripts(game_dir: &PathBuf) -> Vec<KubeJSScript> {
    detect_kubejs_scripts(game_dir)
        .into_iter()
        .flat_map(|dir| dir.scripts)
        .collect()
}
