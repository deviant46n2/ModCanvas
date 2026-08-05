package com.modcanvas.companion.client;

import com.google.gson.JsonElement;
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
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class AssetExporter {
    private static final Logger LOGGER = LoggerFactory.getLogger("AssetExporter");
    private static boolean hasExported = false;

    /** Cap on textures encoded per EXTRACT_TEXTURES_REQUEST, bounding payload
     * size and client-tick work. */
    public static final int DEFAULT_MAX_TEXTURES = 2000;

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

    /** Request-driven runtime texture extraction. Enumerates every PNG the
     * in-game ResourceManager can resolve for the requested namespaces and
     * streams them back as {@code EXTRACT_TEXTURES_RESULT} keyed by full
     * resource location (`ns:textures/…/name.png`). Unlike the one-shot
     * ASSETS_READY path, this runs on demand and can cover any namespace
     * (quest backgrounds, chapter images, custom image components) — including
     * textures that only exist at runtime. */
    public static void extract(WorkbenchCompanionClient.WorkbenchEvent event) {
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc == null) return;
            ResourceManager rm = mc.getResourceManager();
            if (rm == null) return;

            JsonObject payload = event.payload != null ? event.payload : new JsonObject();
            String requestId = payload.has("requestId") ? payload.get("requestId").getAsString() : null;

            Set<String> namespaces = new HashSet<>();
            if (payload.has("namespaces") && payload.get("namespaces").isJsonArray()) {
                for (JsonElement el : payload.get("namespaces").getAsJsonArray()) {
                    if (el.isJsonPrimitive() && el.getAsJsonPrimitive().isString()) {
                        namespaces.add(el.getAsString());
                    }
                }
            }
            if (namespaces.isEmpty()) {
                LOGGER.warn("[AssetExporter] EXTRACT_TEXTURES_REQUEST with no namespaces; ignoring");
                return;
            }
            int maxTextures = payload.has("maxTextures")
                ? payload.get("maxTextures").getAsInt()
                : DEFAULT_MAX_TEXTURES;

            Map<ResourceLocation, Resource> all = rm.listResources("textures", loc ->
                namespaces.contains(loc.getNamespace()) && loc.getPath().endsWith(".png"));

            JsonObject textures = new JsonObject();
            int count = 0;
            for (Map.Entry<ResourceLocation, Resource> entry : all.entrySet()) {
                if (count >= maxTextures) {
                    LOGGER.warn("[AssetExporter] Hit maxTextures cap ({}) while extracting {}", maxTextures, namespaces);
                    break;
                }
                ResourceLocation loc = entry.getKey();
                try (InputStream in = entry.getValue().open()) {
                    BufferedImage img = ImageIO.read(in);
                    if (img == null) continue;

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    ImageIO.write(img, "png", baos);
                    String dataUrl = "data:image/png;base64," + Base64.getEncoder().encodeToString(baos.toByteArray());
                    textures.addProperty(loc.toString(), dataUrl);
                    count++;
                }
            }

            JsonObject result = new JsonObject();
            if (requestId != null) result.addProperty("requestId", requestId);
            result.add("textures", textures);
            WorkbenchCompanionClient.sendEvent("EXTRACT_TEXTURES_RESULT", result);
            LOGGER.info("[AssetExporter] Extracted {} runtime textures for {}", count, namespaces);
        } catch (Exception e) {
            LOGGER.error("[AssetExporter] Failed to extract runtime textures", e);
        }
    }

    public static void reset() {
        hasExported = false;
    }
}
