package com.modcanvas.companion.client;

import com.modcanvas.companion.HotSwapClient;
import com.modcanvas.companion.WorkbenchCompanionCommon;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WorkbenchCompanionClient implements ClientModInitializer {
    public static final Logger CLIENT_LOGGER = LoggerFactory.getLogger(WorkbenchCompanionCommon.MOD_ID + ".client");

    private static HotSwapClient hotSwapClient;

    @Override
    public void onInitializeClient() {
        CLIENT_LOGGER.info("[Workbench Companion] Client initializer running");
        
        // Initialize WebSocket client
        hotSwapClient = new HotSwapClient();
        hotSwapClient.connect();
        
        // Register /workbench command
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) -> {
            hotSwapClient.registerCommands(dispatcher);
        });
        
        // Periodic client tick for reconnection logic
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (hotSwapClient != null) {
                hotSwapClient.onClientTick();
            }
        });
    }

    public static HotSwapClient getHotSwapClient() {
        return hotSwapClient;
    }
}