package com.modcanvas.companion.client;

import com.mojang.blaze3d.platform.NativeImage;

import java.util.Base64;

/**
 * PNG encoding for the icon capture pipeline (extracted s36 from
 * ItemIconRenderer for the 300-line rule). Logs through ItemIconRenderer's
 * logger so the [ItemIconRenderer] tag stays stable for docs/probes.
 */
final class ItemIconPng {
    private ItemIconPng() {
    }

    /**
     * Encode the downloaded texture as a base64 PNG data URL. The readback is
     * already upright (same ortho + atlas conventions as vanilla's GUI pass),
     * so no row flip is applied.
     */
    static String encodePng(NativeImage src) {
        try {
            byte[] png = src.asByteArray();
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(png);
        } catch (Exception e) {
            ItemIconRenderer.LOGGER.warn("[ItemIconRenderer] PNG encode failed: {}", e.toString());
            return null;
        }
    }
}
