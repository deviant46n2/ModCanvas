package com.modcanvas.companion;

import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.modcanvas.companion.client.WorkbenchCompanionClient;

@Mod("workbench_companion")
public class WorkbenchCompanionForge {
    public static final String MOD_ID = "workbench_companion";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public WorkbenchCompanionForge(IEventBus modBus) {
        LOGGER.info("[Workbench Companion] Initializing NeoForge mod");
        modBus.addListener(this::onClientSetup);
    }

    @SubscribeEvent
    public void onClientSetup(FMLClientSetupEvent event) {
        LOGGER.info("[Workbench Companion] Client setup event");
        WorkbenchCompanionClient.init();
    }
}
