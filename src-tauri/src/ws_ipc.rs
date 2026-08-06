use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error, info};

use crate::ws_protocol::{classify_client_info, events, ClientRole, ConnectionStatus, ModEvent};

const DEFAULT_PORT: u16 = 9876;

#[derive(Debug)]
struct WsClient {
    id: String,
    sender: mpsc::UnboundedSender<Message>,
    role: ClientRole,
}

/// WebSocket message hub for the companion bridge.
///
/// Peers are classified by their CLIENT_INFO frame: the app's frontend
/// (`modcanvas-app`) and companion mods (`workbench-companion`). Companion
/// frames are routed to app peers, app commands are broadcast to companions,
/// and connection-state changes are pushed to app peers as CONNECTION_STATUS
/// frames. The Tauri event channel (`ws-ipc:status`/`ws-ipc:event`) is still
/// emitted alongside for environments where it works, but it is no longer the
/// frontend's source of truth — it silently drops on some Linux/WebKitGTK
/// stacks (evals from async commands never run).
pub struct WsIpcServer {
    app_handle: AppHandle,
    port: Arc<RwLock<u16>>,
    clients: Arc<RwLock<HashMap<String, WsClient>>>,
    /// Most recent companion CLIENT_INFO payload, replayed to late-joining
    /// app peers so the frontend can show companion identity.
    last_companion_info: Arc<RwLock<Option<Value>>>,
    shutdown_tx: Arc<RwLock<Option<broadcast::Sender<()>>>>,
    server_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl WsIpcServer {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            port: Arc::new(RwLock::new(DEFAULT_PORT)),
            clients: Arc::new(RwLock::new(HashMap::new())),
            last_companion_info: Arc::new(RwLock::new(None)),
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
        let last_companion_info = self.last_companion_info.clone();
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
                                let last_companion_info = last_companion_info.clone();
                                tokio::spawn(handle_connection(
                                    stream,
                                    addr,
                                    clients,
                                    last_companion_info,
                                    app_handle,
                                    server_port,
                                ));
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

    /// Send an event to companion peers (the frontend's command channel).
    pub async fn broadcast(&self, event: ModEvent) -> Result<usize> {
        let json = event.to_json()?;
        let message = Message::Text(json.into());

        let clients = self.clients.read().await;
        let mut count = 0;
        for client in clients.values() {
            if client.role != ClientRole::App {
                count += 1;
                if client.sender.send(message.clone()).is_err() {
                    debug!("Failed to send to client (may be disconnected)");
                }
            }
        }

        Ok(count)
    }

    /// Send an event to the app peer(s) — companion frames and status pushes.
    async fn send_to_app_clients(&self, event: ModEvent) {
        let Ok(json) = event.to_json() else { return };
        let message = Message::Text(json.into());
        let clients = self.clients.read().await;
        for client in clients.values() {
            if client.role == ClientRole::App {
                let _ = client.sender.send(message.clone());
            }
        }
    }

    /// Companion bridge state. Counts companion and unidentified peers only —
    /// the app's own socket never makes the bridge look connected.
    pub async fn get_status(&self) -> ConnectionStatus {
        let clients = self.clients.read().await;
        let port = *self.port.read().await;
        let companion_clients = clients
            .values()
            .filter(|c| c.role != ClientRole::App)
            .count();
        ConnectionStatus {
            connected: companion_clients > 0,
            client_count: companion_clients,
            port,
        }
    }

    async fn emit_status(&self) {
        let status = self.get_status().await;
        // Tauri event channel (works on most stacks; silently dropped on the
        // Linux/WebKitGTK configurations we no longer depend on it for).
        let _ = self.app_handle.emit("ws-ipc:status", status.clone());
        // Primary channel: push the state to app peers over their sockets.
        let payload = serde_json::to_value(&status).unwrap_or(Value::Null);
        self.send_to_app_clients(ModEvent::new(events::CONNECTION_STATUS).with_payload(payload))
            .await;
    }

    async fn cache_companion_info(&self, payload: Value) {
        *self.last_companion_info.write().await = Some(payload);
    }

    async fn replay_companion_info_to_app(&self) {
        let cached = self.last_companion_info.read().await.clone();
        if let Some(payload) = cached {
            self.send_to_app_clients(ModEvent::new(events::CLIENT_INFO).with_payload(payload))
                .await;
        }
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    clients: Arc<RwLock<HashMap<String, WsClient>>>,
    last_companion_info: Arc<RwLock<Option<Value>>>,
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

    {
        let mut clients = clients.write().await;
        clients.insert(
            client_id.clone(),
            WsClient {
                id: client_id.clone(),
                sender: tx.clone(),
                role: ClientRole::Unidentified,
            },
        );
    }

    // Announce the new peer so app peers update the connection pill.
    let _ = app_handle.state::<Arc<WsIpcServer>>().emit_status().await;

    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let client_id_recv = client_id.clone();
    let clients_recv = clients.clone();
    let app_handle_recv = app_handle.clone();
    let last_companion_info_recv = last_companion_info.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    debug!("Received from {}: {}", client_id_recv, text);
                    let Ok(event) = serde_json::from_str::<ModEvent>(&text) else {
                        continue;
                    };
                    route_frame(
                        &client_id_recv,
                        event,
                        &clients_recv,
                        &last_companion_info_recv,
                        &app_handle_recv,
                        actual_port,
                    )
                    .await;
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

    {
        let mut clients = clients.write().await;
        clients.remove(&client_id);
    }
    let _ = app_handle
        .state::<Arc<WsIpcServer>>()
        .emit_status()
        .await;

    debug!("Client {} disconnected", client_id);
}

/// Route one parsed frame based on the sender's role.
async fn route_frame(
    sender_id: &str,
    event: ModEvent,
    clients: &Arc<RwLock<HashMap<String, WsClient>>>,
    last_companion_info: &Arc<RwLock<Option<Value>>>,
    app_handle: &AppHandle,
    actual_port: u16,
) {
    // CLIENT_INFO is the handshake: it may change the sender's role.
    if event.event == events::CLIENT_INFO {
        let payload = event.payload.clone();
        let role = classify_client_info(payload.as_ref());
        {
            let mut clients = clients.write().await;
            if let Some(client) = clients.get_mut(sender_id) {
                client.role = role;
            }
        }
        match role {
            ClientRole::App => {
                // Push the current state so a freshly-connected app peer is
                // immediately in sync, and replay the last companion identity.
                let _ = app_handle.state::<Arc<WsIpcServer>>().emit_status().await;
                let _ = app_handle
                    .state::<Arc<WsIpcServer>>()
                    .replay_companion_info_to_app()
                    .await;
                return;
            }
            ClientRole::Companion => {
                if let Some(payload) = payload {
                    let mut cached = last_companion_info.write().await;
                    *cached = Some(payload.clone());
                    // forward the identity to the app peer
                    let _ = app_handle
                        .state::<Arc<WsIpcServer>>()
                        .send_to_app_clients(ModEvent::new(events::CLIENT_INFO).with_payload(payload))
                        .await;
                }
                return;
            }
            ClientRole::Unidentified => return,
        }
    }

    // Non-handshake frames: route by role.
    let sender_role = {
        let clients = clients.read().await;
        clients
            .get(sender_id)
            .map(|c| c.role)
            .unwrap_or(ClientRole::Unidentified)
    };
    let server = app_handle.state::<Arc<WsIpcServer>>();
    match sender_role {
        // Companion frames flow to the app peer.
        ClientRole::Companion | ClientRole::Unidentified => {
            let _ = server.send_to_app_clients(event).await;
        }
        // App frames are commands for the companions.
        ClientRole::App => {
            let _ = server.broadcast(event).await;
        }
    }
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
