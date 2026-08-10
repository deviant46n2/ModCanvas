//! Tauri commands exposed by the WS IPC hub: push an event to companions,
//! read bridge status, and restart the listener.

use std::sync::Arc;

use serde_json::Value;
use tauri::State;

use crate::ws_protocol::{ConnectionStatus, ModEvent};

use super::WsIpcServer;

#[tauri::command]
pub async fn ws_ipc_send_event(
    event_type: String,
    path: Option<String>,
    payload: Option<Value>,
    state: State<'_, Arc<WsIpcServer>>,
) -> Result<usize, String> {
    let mut event = ModEvent::new(event_type);
    if let Some(path) = path {
        event = event.with_path(path);
    }
    if let Some(payload) = payload {
        event = event.with_payload(payload);
    }
    state.broadcast(event).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ws_ipc_get_status(
    state: State<'_, Arc<WsIpcServer>>,
) -> Result<ConnectionStatus, String> {
    Ok(state.get_status().await)
}

#[tauri::command]
pub async fn ws_ipc_restart(
    state: State<'_, Arc<WsIpcServer>>,
) -> Result<(), String> {
    state.stop().await;
    state.start().await.map_err(|e| e.to_string())
}
