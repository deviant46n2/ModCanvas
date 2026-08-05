use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error, info, warn};

const DEFAULT_PORT: u16 = 9876;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEvent {
    pub event: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

/// Standard event types for ModCanvas <-> Companion Mod communication
pub mod events {
    pub const RELOAD_KUBEJS_SCRIPTS: &str = "RELOAD_KUBEJS_SCRIPTS";
    pub const RELOAD_CRAFTTWEAKER: &str = "RELOAD_CRAFTTWEAKER";
    pub const RELOAD_CONFIG: &str = "RELOAD_CONFIG";
    pub const RELOAD_QUESTS: &str = "RELOAD_QUESTS";
    pub const RELOAD_PROGRESSION: &str = "RELOAD_PROGRESSION";
    pub const ASSETS_READY: &str = "ASSETS_READY";
    pub const CLIENT_INFO: &str = "CLIENT_INFO";
    pub const PING: &str = "PING";
    pub const PONG: &str = "PONG";
    /// ModCanvas → companion: render a batch of item ids with the real Minecraft
    /// renderer (payload: `requestId`, `size`, `items[]`).
    pub const RENDER_ITEMS_REQUEST: &str = "RENDER_ITEMS_REQUEST";
    /// companion → ModCanvas: base64 PNG data URLs for rendered items
    /// (payload: `requestId`, `rendered: {itemId: dataUrl}`).
    pub const RENDER_ITEMS_RESULT: &str = "RENDER_ITEMS_RESULT";
    /// ModCanvas → companion: extract runtime-resolvable textures for the given
    /// namespaces via the in-game ResourceManager (payload: `requestId`,
    /// `namespaces[]`, optional `maxTextures`).
    pub const EXTRACT_TEXTURES_REQUEST: &str = "EXTRACT_TEXTURES_REQUEST";
    /// companion → ModCanvas: base64 PNG data URLs keyed by full resource
    /// location (payload: `requestId`, `textures: {ns:textures/path.png: url}`).
    pub const EXTRACT_TEXTURES_RESULT: &str = "EXTRACT_TEXTURES_RESULT";
}

impl ModEvent {
    pub fn new(event: impl Into<String>) -> Self {
        Self {
            event: event.into(),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            path: None,
            payload: None,
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn with_payload(mut self, payload: Value) -> Self {
        self.payload = Some(payload);
        self
    }

    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(self).context("Failed to serialize ModEvent")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub connected: bool,
    pub client_count: usize,
    pub port: u16,
}

#[derive(Debug)]
struct WsClient {
    sender: mpsc::UnboundedSender<Message>,
}

#[derive(Debug)]
pub struct WsIpcServer {
    app_handle: AppHandle,
    port: Arc<RwLock<u16>>,
    clients: Arc<RwLock<HashMap<String, WsClient>>>,
    shutdown_tx: Arc<RwLock<Option<broadcast::Sender<()>>>>,
    server_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl WsIpcServer {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            port: Arc::new(RwLock::new(DEFAULT_PORT)),
            clients: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx: Arc::new(RwLock::new(None)),
            server_task: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn start(&self) -> Result<()> {
        let port = *self.port.read().await;
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = TcpListener::bind(addr).await.map_err(|e| {
            anyhow!("Failed to bind WebSocket IPC server on port {}: {}. Make sure no other instance is running.", port, e)
        })?;
        info!("WebSocket IPC server listening on {}", addr);
        *self.port.write().await = port;

        let (shutdown_tx, mut shutdown_rx) = broadcast::channel(1);
        *self.shutdown_tx.write().await = Some(shutdown_tx);

        let app_handle = self.app_handle.clone();
        let clients = self.clients.clone();
        let port = self.port.clone();

        let server_port = *port.read().await;
        let server_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("WebSocket IPC server shutdown signal received");
                        break;
                    }
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, addr)) => {
                                debug!("New WebSocket connection from {}", addr);
                                let clients = clients.clone();
                                let app_handle = app_handle.clone();
                                tokio::spawn(handle_connection(stream, addr, clients, app_handle, server_port));
                            }
                            Err(e) => {
                                error!("WebSocket accept error: {}", e);
                            }
                        }
                    }
                }
            }
            info!("WebSocket IPC server stopped");
        });

        *self.server_task.write().await = Some(server_task);

        self.emit_status().await;
        Ok(())
    }

    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.server_task.write().await.take() {
            task.abort();
        }
        self.clients.write().await.clear();
        self.emit_status().await;
    }

    pub async fn broadcast(&self, event: ModEvent) -> Result<usize> {
        let json = event.to_json()?;
        let message = Message::Text(json.into());
        
        let clients = self.clients.read().await;
        let count = clients.len();
        
        for client in clients.values() {
            if client.sender.send(message.clone()).is_err() {
                debug!("Failed to send to client (may be disconnected)");
            }
        }
        
        Ok(count)
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        let clients = self.clients.read().await;
        let port = *self.port.read().await;
        ConnectionStatus {
            connected: !clients.is_empty(),
            client_count: clients.len(),
            port,
        }
    }

    async fn emit_status(&self) {
        let status = self.get_status().await;
        let _ = self.app_handle.emit("ws-ipc:status", status);
    }

    pub async fn add_client(&self, client_id: String, sender: mpsc::UnboundedSender<Message>) {
        self.clients.write().await.insert(client_id, WsClient { sender });
        self.emit_status().await;
    }

    pub async fn remove_client(&self, client_id: &str) {
        self.clients.write().await.remove(client_id);
        self.emit_status().await;
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    clients: Arc<RwLock<HashMap<String, WsClient>>>,
    app_handle: AppHandle,
    actual_port: u16,
) {
    let client_id = format!("{}:{}", addr.ip(), addr.port());
    
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("WebSocket handshake failed for {}: {}", addr, e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let client_id_clone = client_id.clone();
    clients.write().await.insert(client_id.clone(), WsClient { sender: tx.clone() });
    let _ = app_handle.emit("ws-ipc:status", {
        let clients = clients.read().await;
        ConnectionStatus {
            connected: !clients.is_empty(),
            client_count: clients.len(),
            port: actual_port,
        }
    });

    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let client_id_recv = client_id_clone.clone();
    let clients_recv = clients.clone();
    let app_handle_recv = app_handle.clone();
    let app_handle_cleanup = app_handle.clone(); // Clone for cleanup
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    debug!("Received from {}: {}", client_id_recv, text);
                    if let Ok(event) = serde_json::from_str::<ModEvent>(&text) {
                        let _ = app_handle_recv.emit("ws-ipc:event", event);
                    }
                }
                Ok(Message::Close(_)) => {
                    debug!("Client {} sent close frame", client_id_recv);
                    break;
                }
                Ok(Message::Ping(data)) => {
                    let _ = tx.send(Message::Pong(data));
                }
                Err(e) => {
                    error!("WebSocket error from {}: {}", client_id_recv, e);
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = forward_task => {},
        _ = recv_task => {},
    }

    let client_id_cleanup = client_id_clone;
    let clients_cleanup = clients_recv.clone();
    let app_handle_cleanup = app_handle_cleanup;
    clients_cleanup.write().await.remove(&client_id_cleanup);
    let _ = app_handle_cleanup.emit("ws-ipc:status", {
        let clients = clients_cleanup.read().await;
        ConnectionStatus {
            connected: !clients.is_empty(),
            client_count: clients.len(),
            port: actual_port,
        }
    });
    
    debug!("Client {} disconnected", client_id_cleanup);
}

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

pub fn register_ws_ipc_commands(app: &mut tauri::App) {
    app.manage(Arc::new(WsIpcServer::new(app.handle().clone())));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mod_event_serialization() {
        let event = ModEvent::new("RELOAD_QUESTS")
            .with_path("config/ftbquests/quests/chapter1.snbt")
            .with_payload(json!({"reason": "file_changed"}));
        
        let json = event.to_json().unwrap();
        let parsed: ModEvent = serde_json::from_str(&json).unwrap();
        
        assert_eq!(parsed.event, "RELOAD_QUESTS");
        assert_eq!(parsed.path, Some("config/ftbquests/quests/chapter1.snbt".to_string()));
        assert_eq!(parsed.payload, Some(json!({"reason": "file_changed"})));
        assert!(parsed.timestamp > 0);
    }

    #[test]
    fn test_mod_event_minimal() {
        let event = ModEvent::new("TEST_EVENT");
        let json = event.to_json().unwrap();
        let parsed: ModEvent = serde_json::from_str(&json).unwrap();
        
        assert_eq!(parsed.event, "TEST_EVENT");
        assert_eq!(parsed.path, None);
        assert_eq!(parsed.payload, None);
    }
}