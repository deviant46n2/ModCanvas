package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.modcanvas.companion.WorkbenchCompanionForge;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Map;

public class AssetExporter {
    private static final Logger LOGGER = LoggerFactory.getLogger("AssetExporter");
    private static boolean hasExported = false;

    public static void export() {
        if (hasExported) return;
        hasExported = true;

        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc == null) return;

            ResourceManager rm = mc.getResourceManager();
            if (rm == null) return;

            JsonObject payload = new JsonObject();
            payload.addProperty("cachePath", ".workbench/cache");
            payload.addProperty("mcVersion", "1.21.1");
            payload.addProperty("loader", "neoforge");

            Map<ResourceLocation, Resource> textures = rm.listResources("textures/gui",
                loc -> loc.getNamespace().equals("ftbquests") && loc.getPath().endsWith(".png"));

            int count = 0;
            for (Map.Entry<ResourceLocation, Resource> entry : textures.entrySet()) {
                ResourceLocation loc = entry.getKey();
                try (InputStream in = entry.getValue().open()) {
                    BufferedImage img = ImageIO.read(in);
                    if (img == null) continue;

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    ImageIO.write(img, "png", baos);
                    byte[] pngData = baos.toByteArray();
                    String base64 = Base64.getEncoder().encodeToString(pngData);
                    String dataUrl = "data:image/png;base64," + base64;

                    String key = loc.getPath()
                        .replace("textures/gui/", "ui_")
                        .replace("/", "_")
                        .replace(".png", "");

                    payload.addProperty(key, dataUrl);
                    count++;
                }
            }

            if (count > 0) {
                LOGGER.info("[AssetExporter] Exported {} FTB Quests GUI textures", count);
                WorkbenchCompanionClient.sendEvent("ASSETS_READY", payload);
            } else {
                LOGGER.warn("[AssetExporter] No FTB Quests GUI textures found");
            }
        } catch (Exception e) {
            LOGGER.error("[AssetExporter] Failed to export assets", e);
        }
    }

    public static void reset() {
        hasExported = false;
    }
}
