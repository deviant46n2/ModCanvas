pub mod commands;
pub mod db;
pub mod models;
pub mod mod_intelligence;
pub mod minecraft;

use tauri::Manager;

use db::Database;
use minecraft::InstanceManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize lighty-launcher AppState once
            lighty_launcher::prelude::AppState::init("ModpackEngine")
                .expect("failed to initialize lighty-launcher");

            // Database
            let db_path = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("modpack_engine.db");

            std::fs::create_dir_all(db_path.parent().unwrap())
                .expect("failed to create data directory");

            let db = Database::open(&db_path).expect("failed to open database");
            app.manage(db);

            // Minecraft instance manager
            let instances_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("instances");

            std::fs::create_dir_all(&instances_dir)
                .expect("failed to create instances directory");

            let instance_manager = InstanceManager::new(instances_dir);
            app.manage(instance_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::list_projects,
            commands::add_mod,
            commands::remove_mod,
            commands::get_project_mods,
            commands::search_mods,
            commands::check_compatibility,
            commands::get_config,
            commands::save_config,
            commands::get_mod_metadata,
            commands::create_mc_instance,
            commands::list_mc_instances,
            commands::launch_mc_instance,
            commands::stop_mc_instance,
            commands::remove_mc_instance,
            commands::get_mc_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Modpack Engine");
}
