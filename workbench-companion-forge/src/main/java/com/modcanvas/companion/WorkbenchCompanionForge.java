package com.modcanvas.companion;

import net.minecraftforge.fml.common.Mod;
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