pub mod commands;
pub mod config_parser;
pub mod db;
pub mod icons;
pub mod imports;
pub mod launcher;
pub mod models;
pub mod mod_intelligence;
pub mod minecraft;
pub mod path_safety;
pub mod progression;
pub mod quest;
pub mod scriptgen;
pub mod shared;
pub mod ws_ipc;

use std::sync::{Arc, OnceLock};
use tauri::Manager;

use db::Database;
use launcher::LauncherDriver;
use minecraft::InstanceManager;
use mod_intelligence::ModIntelligence;

static TEST_INSTANCE_ID: OnceLock<String> = OnceLock::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file (if present) for secrets like CURSEFORGE_API_KEY
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Database
            let db_path = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("modcanvas.db");

            std::fs::create_dir_all(db_path.parent().unwrap())
                .expect("failed to create data directory");

            let db = Database::open(&db_path).expect("failed to open database");
            app.manage(db);

            // Mod Intelligence
            let intelligence = ModIntelligence::new();
            app.manage(intelligence);

            // Minecraft instance manager
            // Priority: MODCANVAS_INSTANCES_DIR env var > Prism Launcher instances dir > app_data_dir/instances
            let instances_dir = if let Ok(env_dir) = std::env::var("MODCANVAS_INSTANCES_DIR") {
                eprintln!("[ModCanvas] Using instances dir from MODCANVAS_INSTANCES_DIR: {env_dir}");
                std::path::PathBuf::from(env_dir)
            } else {
                let driver = crate::launcher::PrismLauncherDriver::new();
                let prism_dir = driver.resolve_instance_root(None);
                if prism_dir.exists() {
                    eprintln!("[ModCanvas] Using Prism Launcher instances dir: {:?}", prism_dir);
                    prism_dir
                } else {
                    let fallback = app_handle
                        .path()
                        .app_data_dir()
                        .expect("failed to resolve app data dir")
                        .join("instances");
                    eprintln!("[ModCanvas] Prism dir not found, using fallback: {:?}", fallback);
                    fallback
                }
            };

            std::fs::create_dir_all(&instances_dir)
                .expect("failed to create instances directory");

            let instance_manager = InstanceManager::new(instances_dir);
            app.manage(instance_manager);

            // WebSocket IPC Server for Minecraft Companion Mod
            let ws_ipc = Arc::new(ws_ipc::WsIpcServer::new(app_handle.clone()));
            app.manage(ws_ipc.clone());

            // Spawn WebSocket server in background
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ws_ipc.start().await {
                    eprintln!("[ModCanvas] Warning: Failed to start WebSocket IPC server: {}", e);
                }
            });

            // Check for test launch mode
            if let Some(instance_id) = TEST_INSTANCE_ID.get() {
                eprintln!("[ModCanvas] Test launch mode: launching instance {}", instance_id);
                let instance_id_clone = instance_id.clone();
                let app_handle_for_launch = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait a bit for the app to fully initialize
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    
                    let manager = app_handle_for_launch.state::<InstanceManager>();
                    
                    // Debug: list all instances
                    let instances = manager.list_instances();
                    eprintln!("[ModCanvas] Test launch - available instances: {:?}", instances.iter().map(|i| &i.id).collect::<Vec<_>>());
                    
                    let emitter = Box::new(commands::TauriProgressEmitter(app_handle_for_launch.clone()));
                    let result = manager.launch_instance(
                        emitter,
                        &instance_id_clone,
                        "Player",
                        "2G",
                        "4G",
                    );
                    
                    match result {
                        Ok(_) => eprintln!("[ModCanvas] Test launch completed successfully"),
                        Err(e) => eprintln!("[ModCanvas] Test launch failed: {}", e),
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::list_projects,
            commands::delete_project,
            commands::add_mod,
            commands::remove_mod,
            commands::get_project_mods,
            commands::search_mods,
            commands::search_modpacks,
            commands::check_compatibility,
            commands::get_config,
            commands::save_config,
            commands::get_mod_metadata,
            commands::get_project_mod_metadata,
            commands::check_compatibility_async,
            commands::get_dep_names,
            commands::list_config_files,
            commands::read_config_file,
            commands::write_config_file,
            commands::parse_config_file,
            commands::save_structured_config,
            commands::create_mc_instance,
            commands::list_mc_instances,
            commands::debug_instance_scan,
            commands::launch_mc_instance,
            commands::stop_mc_instance,
            commands::remove_mc_instance,
            commands::get_mc_logs,
            commands::resolve_mc_loader_version,
            commands::deploy_companion_mod_for_project,
            commands::import_modrinth_mrpack,
            commands::import_instance_folder,
            commands::import_packwiz,
            commands::import_curseforge_zip,
            commands::auto_import_pack,
            commands::export_modrinth_mrpack,
            commands::export_curseforge_zip,
            commands::get_curseforge_api_key,
            commands::set_curseforge_api_key,
            commands::search_modpacks_curseforge,
            commands::search_modpacks_all,
            commands::download_modpack_modrinth,
            commands::import_modpack_via_prism,
            commands::import_curseforge_via_prism,
            commands::open_prism_launcher,
            commands::get_progression_graph,
            commands::save_progression_graph,
            commands::add_progression_node,
            commands::update_progression_node,
            commands::delete_progression_node,
            commands::add_progression_edge,
            commands::delete_progression_edge,
            commands::analyze_progression,
            commands::auto_generate_progression,
            commands::get_quest_graph,
            commands::save_quest_graph,
            commands::add_quest_node,
            commands::update_quest_node,
            commands::delete_quest_node,
            commands::add_quest_edge,
            commands::delete_quest_edge,
            commands::analyze_quest_graph,
            commands::auto_generate_quest,
            commands::save_project,
            commands::test_project,
            commands::scan_mod_jar_textures,
            commands::get_texture_by_id,
            commands::get_pack_icon,
            commands::import_ftb_quests_from_dir,
            commands::import_ftb_quests_one_click,
            commands::export_ftb_quests_to_dir,
            ws_ipc::ws_ipc_send_event,
            ws_ipc::ws_ipc_get_status,
            ws_ipc::ws_ipc_restart,
            commands::scan_instance_mods,
            commands::get_packwiz_workspace,
            commands::get_kubejs_scripts,
            commands::get_all_kubejs_scripts,
            commands::search_items,
            commands::search_tags,
            commands::get_item_details,
            commands::generate_recipe_scripts,
            commands::write_script_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Minecraft Modpack Maker");
}

pub fn set_test_instance_id(id: String) {
    TEST_INSTANCE_ID.set(id).ok();
}
