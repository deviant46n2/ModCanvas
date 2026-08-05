package com.modcanvas.companion.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class WorkbenchEventHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger("WorkbenchEventHandler");

    public static void handleEvent(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Processing event: {}", event);

        if (event.eventType.equals("RENDER_ITEMS_REQUEST")) {
            // Item rendering does not need a world/player; handled first so it
            // also works from the main menu.
            handleRenderItems(event);
            return;
        }

        if (event.eventType.equals("EXTRACT_TEXTURES_REQUEST")) {
            // ResourceManager lookup + PNG encode does not need a world/player.
            AssetExporter.extract(event);
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            LOGGER.warn("[WorkbenchEventHandler] Player is null, cannot execute command");
            return;
        }

        switch (event.eventType) {
            case "RELOAD_QUESTS" -> handleQuestReload(event);
            case "RELOAD_KUBEJS_SCRIPTS" -> handleKubeJSReload(event);
            case "RELOAD_CRAFTTWEAKER" -> handleCraftTweakerReload(event);
            case "RELOAD_CONFIG" -> handleConfigReload(event);
            case "RELOAD_PROGRESSION" -> handleProgressionReload(event);
            case "RELOAD_ALL" -> handleReloadAll(event);
            default -> LOGGER.warn("[WorkbenchEventHandler] Unknown event type: {}", event.eventType);
        }
    }

    /** Queue a batch of item ids for in-game rendering. Results stream back as
     * a single {@code RENDER_ITEMS_RESULT} once the queue drains (see
     * {@link ItemRenderQueue}). */
    private static void handleRenderItems(WorkbenchCompanionClient.WorkbenchEvent event) {
        JsonObject payload = event.payload != null ? event.payload : new JsonObject();
        String requestId = payload.has("requestId") ? payload.get("requestId").getAsString() : null;
        int size = payload.has("size") ? payload.get("size").getAsInt() : ItemIconRenderer.DEFAULT_SIZE;

        List<String> items = new ArrayList<>();
        JsonElement itemsEl = payload.get("items");
        if (itemsEl != null && itemsEl.isJsonArray()) {
            for (JsonElement el : itemsEl.getAsJsonArray()) {
                if (el.isJsonPrimitive() && el.getAsJsonPrimitive().isString()) {
                    items.add(el.getAsString());
                }
            }
        }

        if (items.isEmpty()) {
            LOGGER.info("[WorkbenchEventHandler] RENDER_ITEMS_REQUEST with no items; ignoring");
            return;
        }

        ItemRenderQueue.enqueue(items, requestId, size);
        LOGGER.info("[WorkbenchEventHandler] Queued {} items for engine rendering", items.size());
    }

    private static void handleQuestReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading quests from: {}", path);

        sendCommand("ftbquests reload");
        sendToast("Quests reloaded from " + path);
    }

    private static void handleConfigReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading configs from: {}", path);

        sendCommand("kubejs reload");
        sendToast("Configs reloaded from " + path);
    }

    private static void handleKubeJSReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading KubeJS scripts");

        sendCommand("kubejs reload");
        sendToast("KubeJS scripts reloaded");
    }

    private static void handleCraftTweakerReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading CraftTweaker scripts");

        sendCommand("ct reload");
        sendToast("CraftTweaker scripts reloaded");
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

    private static void sendCommand(String command) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null && mc.player.connection != null) {
            mc.player.connection.sendCommand(command);
        }
    }

    private static void sendToast(String message) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null) {
            mc.player.displayClientMessage(Component.literal("§a[ModCanvas] §r" + message), true);
        }
    }
}
