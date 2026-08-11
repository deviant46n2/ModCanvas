package com.modcanvas.companion.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
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

        if (event.eventType.equals("STOP_INSTANCE")) {
            // Graceful shutdown: the same stop() the game's quit button calls
            // (saves worlds, flushes, then exits). Works from the main menu.
            // External knowledge: Minecraft.stop() is Mojang-mapped in 1.21.1;
            // verified by the compile against the game jar.
            LOGGER.info("[WorkbenchEventHandler] STOP_INSTANCE — shutting down game");
            Minecraft.getInstance().stop();
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
        // No success toast here, by design (P2-HOTSWAP): the companion cannot
        // verify the reload (it cannot read its own process's log, and FTB's
        // editing permission is not client-checkable). Claiming success
        // without evidence was the lie the app's evidence loop exists to
        // kill — the app watches the game log for FTB's "Loading quests from"
        // line and reports PASS/FAIL.
    }

    private static void handleConfigReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading configs from: {}", path);

        sendCommand("kubejs reload");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleKubeJSReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading KubeJS scripts");

        sendCommand("kubejs reload");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleCraftTweakerReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading CraftTweaker scripts");

        sendCommand("ct reload");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleProgressionReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading progression from: {}", path);
        // No command and no toast: progression has no in-game reload path yet —
        // toasting success here would be a claim with no mechanism behind it.
    }

    private static void handleReloadAll(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading everything");
        handleQuestReload(event);
        handleConfigReload(event);
        handleKubeJSReload(event);
        handleProgressionReload(event);
        // No blanket success toast — individual handlers are verified by the
        // app's evidence loop as each reload type is un-frozen.
    }

    private static void sendCommand(String command) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null && mc.player.connection != null) {
            mc.player.connection.sendCommand(command);
        }
    }
}
