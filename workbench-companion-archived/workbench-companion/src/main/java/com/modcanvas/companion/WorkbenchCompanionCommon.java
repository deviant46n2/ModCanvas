package com.modcanvas.companion;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WorkbenchCompanionCommon implements ModInitializer {
    public static final String MOD_ID = "workbench-companion";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        LOGGER.info("[Workbench Companion] Common initializer running");
        // Common initialization (runs on both client and server)
    }
}