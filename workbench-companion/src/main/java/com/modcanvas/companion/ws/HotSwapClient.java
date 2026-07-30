package com.modcanvas.companion.ws;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.modcanvas.companion.WorkbenchCompanionCommon;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class HotSwapClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(WorkbenchCompanionCommon.MOD_ID + ".ws");
    private static final String DEFAULT_HOST = "127.0.0.1";
    private static final int DEFAULT_PORT = 9876;
    private static final int RECONNECT_DELAY_SECONDS = 5;
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    
    private final Gson gson = new Gson();
    private final ConcurrentLinkedQueue<Consumer<MinecraftClient>> pendingEvents = new ConcurrentLinkedQueue<>();
    private final ScheduledExecutorService reconnectScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "WorkbenchCompanion-Reconnect");
        t.setDaemon(true);
        return t;
    });
    
    private WebSocketClient webSocketClient;
    private volatile boolean isConnected = false;
    private volatile boolean shouldReconnect = true;
    private int reconnectAttempts = 0;
    private String serverHost = DEFAULT_HOST;
    private int serverPort = DEFAULT_PORT;
    
    // Event handlers
    private final java.util.Map<String, Consumer<JsonObject>> eventHandlers = new java.util.concurrent.ConcurrentHashMap<>();
    
    public HotSwapClient() {
        registerDefaultHandlers();
    }
    
    private void registerDefaultHandlers() {
        // RELOAD_QUESTS event - triggers FTB Quests reload
        registerHandler("RELOAD_QUESTS", this::handleReloadQuests);
        
        // RELOAD_KUBEJS_SCRIPTS event - triggers KubeJS reload
        registerHandler("RELOAD_KUBEJS_SCRIPTS", this::handleReloadKubeJS);
        
        // RELOAD_CRAFTTWEAKER event - triggers CraftTweaker reload
        registerHandler("RELOAD_CRAFTTWEAKER", this::handleReloadCraftTweaker);
        
        // RELOAD_CONFIG event - generic config reload
        registerHandler("RELOAD_CONFIG", this::handleReloadConfig);
        
        // PING event - respond with PONG
        registerHandler("PING", event -> {
            sendEvent("PONG", new JsonObject());
        });
    }
    
    public void registerHandler(String eventType, Consumer<JsonObject> handler) {
        eventHandlers.put(eventType, handler);
    }
    
    public void connect() {
        connect(DEFAULT_HOST, DEFAULT_PORT);
    }
    
    public void connect(String host, int port) {
        this.serverHost = host;
        this.serverPort = port;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        
        try {
            URI uri = new URI("ws://" + host + ":" + port);
            webSocketClient = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    isConnected = true;
                    reconnectAttempts = 0;
                    LOGGER.info("[Workbench Companion] Connected to WebSocket server at {}:{}", host, port);
                    sendClientInfo();
                }
                
                @Override
                public void onMessage(String message) {
                    processMessage(message);
                }
                
                @Override
                public void onClose(int code, String reason, boolean remote) {
                    isConnected = false;
                    LOGGER.warn("[Workbench Companion] Disconnected from WebSocket server: {} - {}", code, reason);
                    scheduleReconnect();
                }
                
                @Override
                public void onError(Exception ex) {
                    LOGGER.error("[Workbench Companion] WebSocket error", ex);
                }
            };
            
            webSocketClient.connect();
            
        } catch (URISyntaxException e) {
            LOGGER.error("[Workbench Companion] Invalid WebSocket URI", e);
        }
    }
    
    private void sendClientInfo() {
        JsonObject info = new JsonObject();
        info.addProperty("client", "workbench-companion");
        info.addProperty("version", "1.0.0");
        info.addProperty("minecraft_version", "1.20.1");
        info.addProperty("mod_loader", "fabric");
        sendEvent("CLIENT_INFO", info);
    }
    
    private void scheduleReconnect() {
        if (!shouldReconnect || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                LOGGER.error("[Workbench Companion] Max reconnection attempts reached. Giving up.");
            }
            return;
        }
        
        reconnectAttempts++;
        int delay = RECONNECT_DELAY_SECONDS * reconnectAttempts; // Exponential backoff
        LOGGER.info("[Workbench Companion] Scheduling reconnect attempt {}/{} in {} seconds...", 
            reconnectAttempts, MAX_RECONNECT_ATTEMPTS, delay);
        
        reconnectScheduler.schedule(() -> {
            if (shouldReconnect && !isConnected) {
                connect(serverHost, serverPort);
            }
        }, delay, TimeUnit.SECONDS);
    }
    
    public void reconnect() {
        LOGGER.info("[Workbench Companion] Manual reconnection requested");
        shouldReconnect = true;
        reconnectAttempts = 0;
        if (webSocketClient != null && webSocketClient.isOpen()) {
            webSocketClient.close();
        }
        connect(serverHost, serverPort);
    }
    
    public void disconnect() {
        shouldReconnect = false;
        if (webSocketClient != null) {
            webSocketClient.close();
        }
        reconnectScheduler.shutdownNow();
    }
    
    private void processMessage(String message) {
        try {
            JsonObject json = gson.fromJson(message, JsonObject.class);
            String eventType = json.has("event") ? json.get("event").getAsString() : "UNKNOWN";
            
            JsonObject payload = json.has("payload") ? json.get("payload").getAsJsonObject() : new JsonObject();
            payload.addProperty("timestamp", json.has("timestamp") ? json.get("timestamp").getAsLong() : System.currentTimeMillis() / 1000);
            if (json.has("path")) {
                payload.addProperty("path", json.get("path").getAsString());
            }
            
            // Queue the event for processing on the main thread
            Consumer<JsonObject> handler = eventHandlers.get(eventType);
            if (handler != null) {
                pendingEvents.add(client -> handler.accept(payload));
            } else {
                LOGGER.warn("[Workbench Companion] Unknown event type: {}", eventType);
            }
            
        } catch (JsonSyntaxException e) {
            LOGGER.error("[Workbench Companion] Failed to parse WebSocket message: {}", message, e);
        }
    }
    
    public void processPendingEvents() {
        Consumer<MinecraftClient> event;
        while ((event = pendingEvents.poll()) != null) {
            MinecraftClient client = MinecraftClient.getInstance();
            if (client != null) {
                event.accept(client);
            }
        }
    }
    
    private void handleReloadQuests(JsonObject payload) {
        String path = payload.has("path") ? payload.get("path").getAsString() : "unknown";
        LOGGER.info("[Workbench Companion] Received RELOAD_QUESTS for: {}", path);
        
        // Execute on main thread
        pendingEvents.add(client -> {
            try {
                // FTB Quests reload command
                client.player.networkHandler.sendCommand("ftbquests reload");
                client.player.sendMessage(Text.literal("§a[Workbench Companion] §rFTB Quests reloaded: " + path), false);
            } catch (Exception e) {
                LOGGER.error("[Workbench Companion] Failed to reload FTB Quests", e);
                client.player.sendMessage(Text.literal("§c[Workbench Companion] §rFailed to reload FTB Quests"), false);
            }
        });
    }
    
    private void handleReloadKubeJS(JsonObject payload) {
        LOGGER.info("[Workbench Companion] Received RELOAD_KUBEJS");
        
        pendingEvents.add(client -> {
            try {
                client.player.networkHandler.sendCommand("kubejs reload");
                client.player.sendMessage(Text.literal("§a[Workbench Companion] §rKubeJS scripts reloaded"), false);
            } catch (Exception e) {
                LOGGER.error("[Workbench Companion] Failed to reload KubeJS", e);
                client.player.sendMessage(Text.literal("§c[Workbench Companion] §rFailed to reload KubeJS"), false);
            }
        });
    }
    
    private void handleReloadCraftTweaker(JsonObject payload) {
        LOGGER.info("[Workbench Companion] Received RELOAD_CRAFTTWEAKER");

        pendingEvents.add(client -> {
            try {
                client.player.networkHandler.sendCommand("ct reload");
                client.player.sendMessage(Text.literal("§a[Workbench Companion] §rCraftTweaker scripts reloaded"), false);
            } catch (Exception e) {
                LOGGER.error("[Workbench Companion] Failed to reload CraftTweaker", e);
                client.player.sendMessage(Text.literal("§c[Workbench Companion] §rFailed to reload CraftTweaker"), false);
            }
        });
    }

    private void handleReloadConfig(JsonObject payload) {
        String path = payload.has("path") ? payload.get("path").getAsString() : "unknown";
        LOGGER.info("[Workbench Companion] Received RELOAD_CONFIG for: {}", path);
        
        pendingEvents.add(client -> {
            client.player.sendMessage(Text.literal("§a[Workbench Companion] §rConfig reload requested: " + path), false);
        });
    }
    
    public void sendEvent(String eventType, JsonObject payload) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            JsonObject message = new JsonObject();
            message.addProperty("event", eventType);
            message.addProperty("timestamp", System.currentTimeMillis() / 1000);
            message.add("payload", payload);
            
            webSocketClient.send(gson.toJson(message));
        }
    }
    
    public String getConnectionStatus() {
        if (isConnected) {
            return String.format("Connected to %s:%d (attempts: %d)", serverHost, serverPort, reconnectAttempts);
        } else if (shouldReconnect) {
            return String.format("Disconnected - Reconnecting... (attempt %d/%d)", reconnectAttempts, MAX_RECONNECT_ATTEMPTS);
        } else {
            return "Disconnected";
        }
    }
    
    public boolean isConnected() {
        return isConnected;
    }
}