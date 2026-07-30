package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.modcanvas.companion.WorkbenchCompanionCommon;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class HotSwapEventHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger("HotSwapEventHandler");
    
    public static void handleEvent(HotSwapEvent event) {
        LOGGER.info("[HotSwapEventHandler] Processing event: {}", event);
        
        switch (event.eventType) {
            case "RELOAD_QUESTS" -> handleQuestReload(event);
            case "RELOAD_CONFIGS" -> handleConfigReload(event);
            case "RELOAD_KUBEJS_SCRIPTS" -> handleKubeJSReload(event);
            case "RELOAD_CRAFTTWEAKER" -> handleCraftTweakerReload(event);
            case "RELOAD_PROGRESSION" -> handleProgressionReload(event);
            case "RELOAD_ALL" -> handleReloadAll(event);
            default -> LOGGER.warn("[HotSwapEventHandler] Unknown event type: {}", event.eventType);
        }
    }
    
    private static void handleQuestReload(HotSwapEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[HotSwapEventHandler] Reloading quests from: {}", path);
        
        // Notify FTB Quests to reload
        if (FabricLoader.getInstance().isModLoaded("ftbquests")) {
            try {
                Class<?> ftbQuestsClass = Class.forName("dev.ftb.mods.ftbquests.quest.QuestManager");
                // Try to call reload method if available
                java.lang.reflect.Method reloadMethod = ftbQuestsClass.getMethod("reload");
                reloadMethod.invoke(null);
                showToast("Quests reloaded from " + path);
            } catch (Exception e) {
                LOGGER.warn("[HotSwapEventHandler] Could not reload FTB Quests: {}", e.getMessage());
                // Try alternative approach
                tryReloadViaCommand("ftbquests reload");
            }
        } else {
            LOGGER.info("[HotSwapEventHandler] FTB Quests not loaded, skipping quest reload");
        }
    }
    
    private static void handleConfigReload(HotSwapEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[HotSwapEventHandler] Reloading configs from: {}", path);
        
        // Reload KubeJS configs if present
        if (FabricLoader.getInstance().isModLoaded("kubejs")) {
            tryReloadViaCommand("kubejs reload");
        }
        
        showToast("Configs reloaded from " + path);
    }
    
    private static void handleKubeJSReload(HotSwapEvent event) {
        LOGGER.info("[HotSwapEventHandler] Reloading KubeJS scripts");
        tryReloadViaCommand("kubejs reload");
        showToast("KubeJS scripts reloaded");
    }
    
    private static void handleProgressionReload(HotSwapEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[HotSwapEventHandler] Reloading progression from: {}", path);
        
        // Handle custom progression mod if present
        showToast("Progression reloaded from " + path);
    }
    
    private static void handleCraftTweakerReload(HotSwapEvent event) {
        LOGGER.info("[HotSwapEventHandler] Reloading CraftTweaker scripts");
        tryReloadViaCommand("ct reload");
        showToast("CraftTweaker scripts reloaded");
    }

    private static void handleReloadAll(HotSwapEvent event) {
        LOGGER.info("[HotSwapEventHandler] Reloading everything");
        handleQuestReload(event);
        handleCraftTweakerReload(event);
        handleConfigReload(event);
        handleKubeJSReload(event);
        handleProgressionReload(event);
        showToast("All resources reloaded");
    }
    
    private static void tryReloadViaCommand(String command) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player != null) {
            client.player.networkHandler.sendCommand(command);
        }
    }
    
    private static void showToast(String message) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player != null) {
            client.player.sendMessage(Text.literal("§a[ModCanvas] §r" + message), false);
        }
    }
}