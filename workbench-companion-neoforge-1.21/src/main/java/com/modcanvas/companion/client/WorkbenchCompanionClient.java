package com.modcanvas.companion.client;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.modcanvas.companion.WorkbenchCompanionForge;
import net.minecraft.client.Minecraft;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

@EventBusSubscriber(modid = WorkbenchCompanionForge.MOD_ID, bus = EventBusSubscriber.Bus.GAME, value = Dist.CLIENT)
public class WorkbenchCompanionClient {
    private static final Logger LOGGER = LoggerFactory.getLogger("WorkbenchCompanionClient");
    private static final Gson GSON = new Gson();

    private static final String DEFAULT_HOST = "127.0.0.1";
    private static final int DEFAULT_PORT = 9876;
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private static final int RECONNECT_DELAY_SECONDS = 5;

    private static WebSocketClient webSocketClient;
    private static final ScheduledExecutorService reconnectScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "WorkbenchCompanion-Reconnect");
        t.setDaemon(true);
        return t;
    });
    private static final ConcurrentLinkedQueue<Consumer<Minecraft>> pendingEvents = new ConcurrentLinkedQueue<>();
    private static final AtomicBoolean isConnecting = new AtomicBoolean(false);
    private static final AtomicBoolean shouldReconnect = new AtomicBoolean(true);
    private static final AtomicBoolean reconnectScheduled = new AtomicBoolean(false);
    private static final AtomicBoolean shouldExportAssets = new AtomicBoolean(false);
    private static int reconnectAttempts = 0;

    private static String serverHost = DEFAULT_HOST;
    private static int serverPort = DEFAULT_PORT;

    public static void init() {
        LOGGER.info("[Workbench Companion] Client init");
        connect();
    }

    public static void connect() {
        connect(DEFAULT_HOST, DEFAULT_PORT);
    }

    public static void connect(String host, int port) {
        if (isConnecting.get() || (webSocketClient != null && webSocketClient.isOpen())) {
            return;
        }

        if (!shouldReconnect.get()) {
            return;
        }

        isConnecting.set(true);
        reconnectScheduled.set(false);
        serverHost = host;
        serverPort = port;

        try {
            URI serverUri = new URI("ws://" + host + ":" + port);
            webSocketClient = new WebSocketClient(serverUri, new Draft_6455()) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    isConnecting.set(false);
                    reconnectAttempts = 0;
                    LOGGER.info("[Workbench Companion] Connected to ModCanvas at {}:{}", host, port);
                    sendClientInfo();
                    shouldExportAssets.set(true);
                }

                @Override
                public void onMessage(String message) {
                    handleMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    isConnecting.set(false);
                    LOGGER.warn("[Workbench Companion] Disconnected from ModCanvas: {} - {}", code, reason);
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex) {
                    isConnecting.set(false);
                    LOGGER.error("[Workbench Companion] WebSocket error", ex);
                    scheduleReconnect();
                }
            };

            webSocketClient.connect();

        } catch (URISyntaxException e) {
            isConnecting.set(false);
            LOGGER.error("[Workbench Companion] Invalid server URI", e);
            scheduleReconnect();
        }
    }

    private static void sendClientInfo() {
        JsonObject info = new JsonObject();
        info.addProperty("client", "workbench-companion");
        info.addProperty("version", "1.0.0");
        info.addProperty("minecraft_version", "1.21.1");
        info.addProperty("mod_loader", "neoforge");
        sendEvent("CLIENT_INFO", info);
    }

    private static void handleMessage(String message) {
        try {
            JsonObject json = JsonParser.parseString(message).getAsJsonObject();
            String eventType = json.get("event").getAsString();
            long timestamp = json.get("timestamp").getAsLong();
            String path = json.has("path") ? json.get("path").getAsString() : null;
            JsonObject payload = json.has("payload") ? json.get("payload").getAsJsonObject() : null;

            WorkbenchEvent event = new WorkbenchEvent(eventType, timestamp, path, payload);

            pendingEvents.add(mc -> {
                WorkbenchEventHandler.handleEvent(event);
            });

            LOGGER.debug("[Workbench Companion] Received event: {}", eventType);

        } catch (Exception e) {
            LOGGER.error("[Workbench Companion] Failed to parse message: {}", message, e);
        }
    }

    private static void scheduleReconnect() {
        if (!shouldReconnect.get()) {
            return;
        }

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            LOGGER.error("[Workbench Companion] Max reconnect attempts ({}) reached", MAX_RECONNECT_ATTEMPTS);
            return;
        }

        if (!reconnectScheduled.compareAndSet(false, true)) {
            return;
        }

        reconnectAttempts++;
        int delay = RECONNECT_DELAY_SECONDS * reconnectAttempts;
        LOGGER.info("[Workbench Companion] Scheduling reconnect attempt {}/{} in {} seconds...",
            reconnectAttempts, MAX_RECONNECT_ATTEMPTS, delay);

        reconnectScheduler.schedule(() -> {
            if (shouldReconnect.get() && !isConnecting.get()) {
                connect(serverHost, serverPort);
            }
        }, delay, TimeUnit.SECONDS);
    }

    @SubscribeEvent
    public static void onClientTick(ClientTickEvent.Post event) {
        Consumer<Minecraft> eventHandler;
        while ((eventHandler = pendingEvents.poll()) != null) {
            Minecraft mc = Minecraft.getInstance();
            if (mc != null) {
                eventHandler.accept(mc);
            }
        }

        if (shouldExportAssets.compareAndSet(true, false)) {
            AssetExporter.export();
        }
    }

    @SubscribeEvent
    public static void registerCommands(RegisterClientCommandsEvent event) {
        var dispatcher = event.getDispatcher();

        dispatcher.register(Commands.literal("workbench")
            .then(Commands.literal("status")
                .executes(context -> {
                    String status = webSocketClient != null && webSocketClient.isOpen()
                        ? "§aConnected to ModCanvas"
                        : "§cDisconnected";
                    context.getSource().sendSuccess(() -> Component.literal("§eWorkbench Companion: " + status), true);
                    return 1;
                }))
            .then(Commands.literal("reconnect")
                .executes(context -> {
                    shouldReconnect.set(true);
                    reconnectAttempts = 0;
                    connect(serverHost, serverPort);
                    context.getSource().sendSuccess(() -> Component.literal("§aReconnecting to ModCanvas..."), true);
                    return 1;
                }))
            .then(Commands.literal("server")
                .then(Commands.argument("host", StringArgumentType.string())
                    .then(Commands.argument("port", IntegerArgumentType.integer())
                        .executes(context -> {
                            String host = StringArgumentType.getString(context, "host");
                            int port = IntegerArgumentType.getInteger(context, "port");
                            serverHost = host;
                            serverPort = port;
                            context.getSource().sendSuccess(() -> Component.literal("§aServer set to " + host + ":" + port), true);
                            if (webSocketClient != null && webSocketClient.isOpen()) {
                                connect(host, port);
                            }
                            return 1;
                        }))))
        );
    }

    public static void sendEvent(String eventType, JsonObject payload) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            JsonObject message = new JsonObject();
            message.addProperty("event", eventType);
            message.addProperty("timestamp", System.currentTimeMillis() / 1000);
            message.add("payload", payload);

            webSocketClient.send(GSON.toJson(message));
        }
    }

    public static void disconnect() {
        shouldReconnect.set(false);
        reconnectScheduler.shutdownNow();
        if (webSocketClient != null && webSocketClient.isOpen()) {
            webSocketClient.close();
        }
        LOGGER.info("[Workbench Companion] Disconnected from ModCanvas");
    }

    public static boolean isConnected() {
        return webSocketClient != null && webSocketClient.isOpen();
    }

    public static String getStatus() {
        if (isConnected()) {
            return "Connected to " + serverHost + ":" + serverPort;
        } else if (shouldReconnect.get()) {
            return "Reconnecting... (attempt " + reconnectAttempts + ")";
        } else {
            return "Disconnected";
        }
    }

    public static class WorkbenchEvent {
        public final String eventType;
        public final long timestamp;
        public final String path;
        public final JsonObject payload;

        public WorkbenchEvent(String eventType, long timestamp, String path, JsonObject payload) {
            this.eventType = eventType;
            this.timestamp = timestamp;
            this.path = path;
            this.payload = payload;
        }

        @Override
        public String toString() {
            return "WorkbenchEvent{type='" + eventType + "', path='" + path + "', timestamp=" + timestamp + "}";
        }
    }
}
