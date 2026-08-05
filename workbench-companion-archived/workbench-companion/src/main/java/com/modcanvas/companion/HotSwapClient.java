package com.modcanvas.companion;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.modcanvas.companion.client.HotSwapEvent;
import com.modcanvas.companion.client.HotSwapEventHandler;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

public class HotSwapClient {
    private static final Logger LOGGER = LoggerFactory.getLogger("HotSwapClient");
    private static final Gson GSON = new Gson();
    
    private WebSocketClient webSocketClient;
    private final ScheduledExecutorService reconnectScheduler = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean isConnecting = new AtomicBoolean(false);
    private final AtomicBoolean shouldReconnect = new AtomicBoolean(true);
    private int reconnectAttempts = 0;
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private static final int RECONNECT_DELAY_SECONDS = 5;
    
    // Server configuration - defaults to Tauri embedded server
    private String serverHost = "127.0.0.1";
    private int serverPort = 9876;
    
    private Consumer<String> onStatusChange;
    private Consumer<HotSwapEvent> onEventReceived;
    
    public void setServer(String host, int port) {
        this.serverHost = host;
        this.serverPort = port;
    }
    
    public void setOnStatusChange(Consumer<String> callback) {
        this.onStatusChange = callback;
    }
    
    public void setOnEventReceived(Consumer<HotSwapEvent> callback) {
        this.onEventReceived = callback;
    }

    public void connect() {
        if (isConnecting.get() || (webSocketClient != null && webSocketClient.isOpen())) {
            return;
        }
        
        if (!shouldReconnect.get()) {
            return;
        }
        
        isConnecting.set(true);
        updateStatus("Connecting...");
        
        try {
            URI serverUri = new URI("ws://" + serverHost + ":" + serverPort);
            webSocketClient = new WebSocketClient(serverUri, new Draft_6455()) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    isConnecting.set(false);
                    reconnectAttempts = 0;
                    updateStatus("Connected to ModCanvas");
                    LOGGER.info("[HotSwapClient] Connected to ModCanvas at {}:{}", serverHost, serverPort);
                }

                @Override
                public void onMessage(String message) {
                    handleMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    isConnecting.set(false);
                    updateStatus("Disconnected: " + reason);
                    LOGGER.warn("[HotSwapClient] Connection closed: {} - {}", code, reason);
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex) {
                    isConnecting.set(false);
                    LOGGER.error("[HotSwapClient] WebSocket error", ex);
                    updateStatus("Error: " + ex.getMessage());
                    scheduleReconnect();
                }
            };
            
            webSocketClient.connect();
            
        } catch (URISyntaxException e) {
            isConnecting.set(false);
            LOGGER.error("[HotSwapClient] Invalid server URI", e);
            updateStatus("Invalid URI");
            scheduleReconnect();
        }
    }
    
    private void handleMessage(String message) {
        try {
            JsonObject json = JsonParser.parseString(message).getAsJsonObject();
            String eventType = json.get("event").getAsString();
            long timestamp = json.get("timestamp").getAsLong();
            String path = json.has("path") ? json.get("path").getAsString() : null;
            JsonObject payload = json.has("payload") ? json.get("payload").getAsJsonObject() : null;
            
            HotSwapEvent event = new HotSwapEvent(eventType, timestamp, path, payload);
            
            // Process on main thread
            MinecraftClient.getInstance().execute(() -> {
                HotSwapEventHandler.handleEvent(event);
                if (onEventReceived != null) {
                    onEventReceived.accept(event);
                }
            });
            
            LOGGER.debug("[HotSwapClient] Received event: {}", eventType);
            
        } catch (Exception e) {
            LOGGER.error("[HotSwapClient] Failed to parse message: {}", message, e);
        }
    }
    
    private void scheduleReconnect() {
        if (!shouldReconnect.get()) {
            return;
        }
        
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            updateStatus("Max reconnect attempts reached");
            LOGGER.error("[HotSwapClient] Max reconnect attempts ({}) reached", MAX_RECONNECT_ATTEMPTS);
            return;
        }
        
        reconnectAttempts++;
        int delay = RECONNECT_DELAY_SECONDS * reconnectAttempts;
        updateStatus("Reconnecting in " + delay + "s... (attempt " + reconnectAttempts + ")");
        
        reconnectScheduler.schedule(() -> {
            if (shouldReconnect.get()) {
                connect();
            }
        }, delay, TimeUnit.SECONDS);
    }
    
    public void onClientTick() {
        // Could add periodic health checks here
    }
    
    public void disconnect() {
        shouldReconnect.set(false);
        reconnectScheduler.shutdownNow();
        if (webSocketClient != null && webSocketClient.isOpen()) {
            webSocketClient.close();
        }
        updateStatus("Disconnected");
    }
    
    public void registerCommands(CommandDispatcher<FabricClientCommandSource> dispatcher) {
        LiteralArgumentBuilder<FabricClientCommandSource> root = 
            net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal("workbench")
                .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal("connect")
                    .executes(context -> {
                        connect();
                        context.getSource().sendFeedback(Text.literal("§aAttempting to connect to ModCanvas..."));
                        return 1;
                    }))
                .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal("disconnect")
                    .executes(context -> {
                        disconnect();
                        context.getSource().sendFeedback(Text.literal("§cDisconnected from ModCanvas"));
                        return 1;
                    }))
                .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal("status")
                    .executes(context -> {
                        String status = webSocketClient != null && webSocketClient.isOpen() ? "§aConnected" : "§cDisconnected";
                        context.getSource().sendFeedback(Text.literal("§eWorkbench Companion: " + status));
                        return 1;
                    }))
                .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal("server")
                    .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument("host", StringArgumentType.string())
                        .then(net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument("port", StringArgumentType.string())
                            .executes(context -> {
                                String host = StringArgumentType.getString(context, "host");
                                int port = Integer.parseInt(StringArgumentType.getString(context, "port"));
                                setServer(host, port);
                                context.getSource().sendFeedback(Text.literal("§aServer set to " + host + ":" + port));
                                if (webSocketClient != null && webSocketClient.isOpen()) {
                                    disconnect();
                                    connect();
                                }
                                return 1;
                            }))));
        
        dispatcher.register(root);
    }
    
    public boolean isConnected() {
        return webSocketClient != null && webSocketClient.isOpen();
    }
    
    private void updateStatus(String status) {
        if (onStatusChange != null) {
            onStatusChange.accept(status);
        }
    }
}