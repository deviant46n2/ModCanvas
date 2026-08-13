//! Per-connection lifecycle: accept the WS handshake, register the peer,
//! pump outbound frames, read inbound frames, and route them by role.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error};

use crate::ws_protocol::{classify_client_info, events, ClientRole, ModEvent};

use super::routing::{parse_frame, route_decision, FrameAction};
use super::{WsClient, WsIpcServer};

pub(super) async fn handle_connection(
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
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    debug!("Received from {}: {}", client_id_recv, text);
                    // Malformed frames are dropped, not treated as errors.
                    let Some(event) = parse_frame(&text) else {
                        continue;
                    };
                    route_frame(
                        &client_id_recv,
                        event,
                        &clients_recv,
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

/// Route one parsed frame based on the sender's role. The decision itself is
/// the pure [`route_decision`]; this function only performs the side effects.
async fn route_frame(
    sender_id: &str,
    event: ModEvent,
    clients: &Arc<RwLock<HashMap<String, WsClient>>>,
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
        match route_decision(&event.event, role, payload.is_some()) {
            FrameAction::HandshakeApp => {
                // Push the current state so a freshly-connected app peer is
                // immediately in sync.
                let _ = app_handle.state::<Arc<WsIpcServer>>().emit_status().await;
            }
            FrameAction::HandshakeCompanion => {
                if let Some(payload) = payload {
                    // forward the identity to the app peer
                    let _ = app_handle
                        .state::<Arc<WsIpcServer>>()
                        .send_to_app_clients(ModEvent::new(events::CLIENT_INFO).with_payload(payload))
                        .await;
                }
            }
            FrameAction::HandshakeNoop => {}
            // Non-CLIENT_INFO actions never apply to handshake frames.
            FrameAction::ForwardToApp | FrameAction::BroadcastToCompanions => {}
        }
        return;
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
    match route_decision(&event.event, sender_role, false) {
        // Companion and tool frames flow to the app peer (the frontend
        // orchestrator). Tool peers are external triggers (e.g. a restart
        // script) whose commands the frontend acts on.
        FrameAction::ForwardToApp => {
            let _ = server.send_to_app_clients(event).await;
        }
        // App frames are commands for the companions.
        FrameAction::BroadcastToCompanions => {
            let _ = server.broadcast(event).await;
        }
        // Handshake actions never apply to regular frames.
        FrameAction::HandshakeApp
        | FrameAction::HandshakeCompanion
        | FrameAction::HandshakeNoop => {}
    }
}
