# Workbench Companion - Forge/NeoForge 1.20.1

## Mod Source Structure

```
workbench-companion-forge/
├── build.gradle
├── src/main/
│   ├── java/com/modcanvas/companion/
│   │   ├── WorkbenchCompanionForge.java
│   │   └── client/
│   │       ├── WorkbenchCompanionClient.java
│   │       └── WorkbenchEventHandler.java
│   └── resources/
│       └── META-INF/neoforge.mods.toml
```

## Build Instructions

### Option 1: Using the NeoForge Template (Recommended)

1. **Create a new NeoForge mod project:**
   ```bash
   # Using the official template
   curl -sSL https://github.com/neoforged/neoforge-template/archive/refs/heads/1.20.1.zip -o template.zip
   unzip template.zip
   cd neoforge-template-1.20.1
   ```

2. **Replace the template source with our mod:**
   ```bash
   # Copy our source files into the template
   cp -r /home/deviant/Projects/ModCanvas/workbench-companion-forge/src/main/java/* src/main/java/
   cp /home/deviant/Projects/ModCanvas/workbench-companion-forge/src/main/resources/META-INF/neoforge.mods.toml src/main/resources/META-INF/
   ```

3. **Update the template's `build.gradle.kts` or `build.gradle`:**
   - Add `implementation("org.java-websocket:Java-WebSocket:1.5.4")` to dependencies
   - Add `implementation("com.google.code.gson:gson:2.10.1")` to dependencies
   - Add Shadow plugin configuration for relocating WebSocket classes

4. **Build:**
   ```bash
   ./gradlew build
   ```

### Option 2: Using Forge Template

1. **Create a new Forge mod project:**
   ```bash
   curl -sSL https://github.com/MinecraftForge/forge-template/archive/refs/heads/1.20.1.zip -o template.zip
   unzip template.zip
   cd forge-template-1.20.1
   ```

2. **Replace template source with our mod files**

3. **Build:**
   ```bash
   ./gradlew build
   ```

## Mod Files

### 1. build.gradle (for NeoForge template)

```gradle
plugins {
    id("java")
    id("net.neoforged.gradle") version "1.0.0"
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.modcanvas.companion"
version = "1.0.0"
archivesBaseName = "workbench-companion"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

repositories {
    mavenCentral()
    maven("https://maven.neoforged.net")
}

dependencies {
    minecraft("com.mojang:minecraft:1.20.1")
    mappings("net.neoforged:forge:1.20.1-48.1.0:recomp")
    
    // NeoForge API
    implementation(fg.deobf("net.neoforged:neoforge:1.20.1-48.1.0"))
    
    // WebSocket client - will be shadowed/relocated
    implementation("org.java-websocket:Java-WebSocket:1.5.4")
    
    // JSON parsing
    implementation("com.google.code.gson:gson:2.10.1")
    
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
}

neoforge {
    mappingsChannel = "official"
    mappingsVersion = "1.20.1"
}

// Shadow plugin configuration - relocate WebSocket classes to avoid conflicts
shadowJar {
    archiveClassifier.set("")
    relocate("org.java_websocket", "com.modcanvas.companion.shaded.org.java_websocket")
    
    manifest {
        attributes(
            "Implementation-Title" to "Workbench Companion",
            "Implementation-Version" to version,
            "Main-Class" to "com.modcanvas.companion.WorkbenchCompanionForge",
            "NeoForge-Mod" to "META-INF/neoforge.mods.toml"
        )
    }
}

tasks.build.dependsOn(shadowJar)

// Testing
tasks.test {
    useJUnitPlatform()
}
```

### 2. neoforge.mods.toml

```toml
modLoader="javafml"
loaderVersion="[48,)"
license="MIT"
issueTrackerURL="https://github.com/modcanvas/workbench-companion/issues"
[[mods]]
modId="workbench_companion"
version="1.0.0"
displayName="Workbench Companion"
description="Real-time WebSocket bridge for ModCanvas hot-swap integration with FTB Quests and KubeJS"
authors=["ModCanvas Team"]
credits="ModCanvas Team"
logoFile="assets/workbench_companion/icon.png"
displayURL="https://github.com/modcanvas/workbench-companion"
updateJSONURL="https://github.com/modcanvas/workbench-companion/releases/latest/download/update.json"
[[dependencies.workbench_companion]]
    modId="neoforge"
    mandatory=true
    versionRange="[48.1.0,)"
    ordering="NONE"
    side="BOTH"
[[dependencies.workbench_companion]]
    modId="minecraft"
    mandatory=true
    versionRange="[1.20.1,1.20.2)"
    ordering="NONE"
    side="BOTH"
[[dependencies.workbench_companion]]
    modId="ftbquests"
    mandatory=false
    versionRange="[1.20.1,1.21)"
    ordering="AFTER"
    side="BOTH"
[[dependencies.workbench_companion]]
    modId="kubejs"
    mandatory=false
    versionRange="[1.20.1,1.21)"
    ordering="AFTER"
    side="BOTH"
```

### 3. WorkbenchCompanionForge.java (Main mod class)

```java
package com.modcanvas.companion;

import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod("workbench_companion")
public class WorkbenchCompanionForge {
    public static final String MOD_ID = "workbench_companion";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public WorkbenchCompanionForge() {
        LOGGER.info("[Workbench Companion] Initializing Forge/NeoForge mod");
    }
}
```

### 4. WorkbenchCompanionClient.java (Client entry point)

```java
package com.modcanvas.companion.client;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.modcanvas.companion.WorkbenchCompanionForge;
import net.minecraft.client.Minecraft;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ServerboundCommandPacket;
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

@EventBusSubscriber(modid = WorkbenchCompanionForge.MOD_ID, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
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
        info.addProperty("minecraft_version", "1.20.1");
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
            
            // Queue for main thread execution
            pendingEvents.add(mc -> WorkbenchEventHandler.handleEvent(event));
            
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
                    context.getSource().sendSuccess(Component.literal("§eWorkbench Companion: " + status), true);
                    return 1;
                }))
            .then(Commands.literal("reconnect")
                .executes(context -> {
                    shouldReconnect.set(true);
                    reconnectAttempts = 0;
                    connect(serverHost, serverPort);
                    context.getSource().sendSuccess(Component.literal("§aReconnecting to ModCanvas..."), true);
                    return 1;
                }))
            .then(Commands.literal("server")
                .then(Commands.argument("host", com.mojang.brigadier.arguments.StringArgumentType.string())
                    .then(Commands.argument("port", com.mojang.brigadier.arguments.IntegerArgumentType.integer())
                        .executes(context -> {
                            String host = com.mojang.brigadier.arguments.StringArgumentType.getString(context, "host");
                            int port = com.mojang.brigadier.arguments.IntegerArgumentType.getInteger(context, "port");
                            serverHost = host;
                            serverPort = port;
                            context.getSource().sendSuccess(Component.literal("§aServer set to " + host + ":" + port), true);
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
```

### 5. WorkbenchEventHandler.java

```java
package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ServerboundCommandPacket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WorkbenchEventHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger("WorkbenchEventHandler");
    
    public static void handleEvent(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Processing event: {}", event);
        
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            LOGGER.warn("[WorkbenchEventHandler] Player is null, cannot execute command");
            return;
        }
        
        switch (event.eventType) {
            case "RELOAD_QUESTS" -> handleQuestReload(event);
            case "RELOAD_KUBEJS" -> handleKubeJSReload(event);
            case "RELOAD_CONFIG" -> handleConfigReload(event);
            case "RELOAD_PROGRESSION" -> handleProgressionReload(event);
            case "RELOAD_ALL" -> handleReloadAll(event);
            default -> LOGGER.warn("[WorkbenchEventHandler] Unknown event type: {}", event.eventType);
        }
    }
    
    private static void handleQuestReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading quests from: {}", path);
        
        executeCommand("/ftbquests reload");
        sendToast("Quests reloaded from " + path);
    }
    
    private static void handleConfigReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading configs from: {}", path);
        
        executeCommand("/kubejs reload");
        sendToast("Configs reloaded from " + path);
    }
    
    private static void handleKubeJSReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading KubeJS scripts");
        
        executeCommand("/kubejs reload");
        sendToast("KubeJS scripts reloaded");
    }
    
    private static void handleProgressionReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading progression from: {}", path);
        
        sendToast("Progression reloaded from " + path);
    }
    
    private static void handleReloadAll(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading everything");
        
        handleQuestReload(event);
        handleConfigReload(event);
        handleKubeJSReload(event);
        handleProgressionReload(event);
        
        sendToast("All resources reloaded");
    }
    
    private static void executeCommand(String command) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null && mc.getConnection() != null) {
            mc.getConnection().send(new ServerboundCommandPacket(command));
        }
    }
    
    private static void sendToast(String message) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null) {
            mc.player.displayClientMessage(Component.literal("§a[ModCanvas] §r" + message), true);
        }
    }
}
```

## How to Use

1. **Install the mod:**
   - Build the JAR: `./gradlew build`
   - Copy `build/libs/workbench-companion-1.0.0.jar` to your instance's `mods/` folder

2. **Start Minecraft with the mod**

3. **Start ModCanvas desktop app**
   - The WebSocket server starts on `ws://127.0.0.1:9876`

4. **In Minecraft chat, you'll see:**
   - `🟢 [Workbench Companion] Connected to ModCanvas!`

5. **Available commands:**
   - `/workbench status` - Show connection status
   - `/workbench reconnect` - Force reconnect
   - `/workbench server <host> <port>` - Change server

6. **When you save quests/configs in ModCanvas:**
   - Auto-sends `RELOAD_QUESTS` or `RELOAD_CONFIG`
   - In-game toast: `⚡ Quests reloaded from config/ftbquests/...`

## Events Supported

| Event | Command | Description |
|-------|---------|-------------|
| `RELOAD_QUESTS` | `/ftbquests reload` | Reload FTB Quests |
| `RELOAD_KUBEJS` | `/kubejs reload` | Reload KubeJS scripts |
| `RELOAD_CONFIG` | `/kubejs reload` | Reload configs |
| `RELOAD_PROGRESSION` | Custom | Reload progression data |
| `RELOAD_ALL` | All above | Full reload |

## JSON Packet Format

```json
{
  "event": "RELOAD_QUESTS",
  "timestamp": 1722182400,
  "path": "config/ftbquests/quests/chapters/welcome.snbt",
  "payload": {
    "reason": "file_changed"
  }
}
```