pub mod commands;
pub mod db;
pub mod models;
pub mod mod_intelligence;

use tauri::Manager;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db_path = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("modpack_engine.db");

            std::fs::create_dir_all(db_path.parent().unwrap())
                .expect("failed to create data directory");

            let db = Database::open(&db_path).expect("failed to open database");
            app.manage(db);

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Modpack Engine");
}
