//! WebSocket IPC hub for the companion bridge.
//!
//! Peers are classified by their CLIENT_INFO frame (see `ws_protocol`), and
//! frames are routed by role via the pure decision logic in [`routing`].
//! Per-connection handling lives in [`handlers`], the Tauri commands in
//! [`commands`]. [`WsIpcServer`] owns the port, the client registry, and the
//! Tauri event fan-out.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde_json::Value;
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info};

use crate::ws_protocol::{events, ClientRole, ConnectionStatus, ModEvent};

mod commands;
mod handlers;
mod routing;

pub use commands::*;

#[cfg(test)]
mod tests;

const DEFAULT_PORT: u16 = 9876;

#[derive(Debug)]
struct WsClient {
    id: String,
    sender: mpsc::UnboundedSender<Message>,
    role: ClientRole,
}

// --- Pure registry operations (no sockets, no Tauri) -------------------------
//
// The fan-out decisions below are pure functions over the client registry, so
// the live-socket path (broadcast counting, status derivation, handshake role
// mutation) can be locked without a listener or an AppHandle. The real
// methods delegate to these; tests exercise the same code the hub runs.

/// Register a peer at the Unidentified role (the pre-handshake state). This is
/// the connection-lifecycle entry point: a new socket always starts unknown,
/// then CLIENT_INFO classifies it.
fn register_client(
    clients: &mut HashMap<String, WsClient>,
    id: String,
    sender: mpsc::UnboundedSender<Message>,
) {
    clients.insert(
        id.clone(),
        WsClient {
            id,
            sender,
            role: ClientRole::Unidentified,
        },
    );
}

/// Apply a CLIENT_INFO classification to a registered peer. The role mutation
/// is the handshake side effect of routing; tests lock that a peer's stored
/// role actually changes (and that an unknown id is a silent no-op).
fn set_client_role(clients: &mut HashMap<String, WsClient>, id: &str, role: ClientRole) {
    if let Some(client) = clients.get_mut(id) {
        client.role = role;
    }
}

/// Count the peers a broadcast reaches: companions + unidentified (stale
/// companions are treated as companions until they identify). App and tool
/// peers never receive commands.
fn broadcast_recipient_count(clients: &HashMap<String, WsClient>) -> usize {
    clients
        .values()
        .filter(|c| routing::is_broadcast_target(c.role))
        .count()
}

/// Derive the bridge status from the registry. `connected`/`client_count`
/// count companion + unidentified peers only — the app's own socket and tool
/// peers never make the bridge look connected.
fn status_from_registry(clients: &HashMap<String, WsClient>, port: u16) -> ConnectionStatus {
    let companion_clients = broadcast_recipient_count(clients);
    ConnectionStatus {
        connected: companion_clients > 0,
        client_count: companion_clients,
        port,
    }
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
                                tokio::spawn(handlers::handle_connection(
                                    stream,
                                    addr,
                                    clients,
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
    /// Tool peers are excluded — they are dev/automation clients, not
    /// companions, and must not receive game commands.
    pub async fn broadcast(&self, event: ModEvent) -> Result<usize> {
        let json = event.to_json()?;
        let message = Message::Text(json.into());

        let clients = self.clients.read().await;
        let count = broadcast_recipient_count(&clients);
        for client in clients.values() {
            if routing::is_broadcast_target(client.role) {
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
            if routing::is_app_target(client.role) {
                let _ = client.sender.send(message.clone());
            }
        }
    }

    /// Companion bridge state. Counts companion and unidentified peers only —
    /// the app's own socket and tool peers never make the bridge look connected.
    pub async fn get_status(&self) -> ConnectionStatus {
        let clients = self.clients.read().await;
        let port = *self.port.read().await;
        status_from_registry(&clients, port)
    }

    async fn emit_status(&self) {
        let status = self.get_status().await;
        // Primary channel: push the state to app peers over their sockets.
        let payload = serde_json::to_value(&status).unwrap_or(Value::Null);
        self.send_to_app_clients(ModEvent::new(events::CONNECTION_STATUS).with_payload(payload))
            .await;
    }
}
