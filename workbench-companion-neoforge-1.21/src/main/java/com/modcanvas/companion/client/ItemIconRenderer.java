package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import com.mojang.blaze3d.vertex.VertexSorting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.client.ClientHooks;
import org.joml.Matrix4f;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Base64;
import java.util.List;

/**
 * Renders item icons with the real Minecraft item renderer into an offscreen
 * framebuffer and returns them as base64 PNG data URLs. This is the "engine
 * render" path: any item ModCanvas's software rasterizer cannot bake (custom
 * mod models, complex transforms, fluids, etc.) can be captured in-game and
 * cached by ModCanvas.
 *
 * <p>Must be called on the render thread (the client main thread) while the GL
 * context is current. The companion processes messages on {@code ClientTickEvent.Post},
 * which satisfies that. All GL state (projection matrix, model-view stack, and
 * the bound framebuffer) is backed up and restored so the game's next frame is
 * unaffected.
 */
public final class ItemIconRenderer {
    private static final Logger LOGGER = LoggerFactory.getLogger("ItemIconRenderer");

    /** Icon tile size ModCanvas asks for; matches the baked-icon output size. */
    public static final int DEFAULT_SIZE = 64;
    /** Batch cap: prevents a single tick from rendering an unbounded list. */
    public static final int MAX_BATCH = 64;

    private ItemIconRenderer() {}

    /**
     * Render each item id to a {@code size}×{@code size} transparent PNG and
     * return a {@code {itemId: "data:image/png;base64,..."}} map. Items that
     * cannot be resolved or fail to render are skipped.
     */
    public static JsonObject render(List<String> itemIds, int size) {
        JsonObject out = new JsonObject();
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || !RenderSystem.isOnRenderThread()) {
            LOGGER.warn("[ItemIconRenderer] Not on the render thread; skipping {} items", itemIds.size());
            return out;
        }
        if (size < 16) size = DEFAULT_SIZE;

        // Mirror the game's GUI projection setup exactly (GameRenderer GUI
        // pass): an ortho over the target and a model-view Z translate that
        // maps GUI depth (0..~500) into the [1000, farPlane] clip range. With
        // an identity model-view the item's Z=150 sits outside the depth range
        // and every quad is clipped.
        float farPlane = ClientHooks.getGuiFarPlane();
        RenderSystem.backupProjectionMatrix();
        RenderSystem.setProjectionMatrix(
            new Matrix4f().setOrtho(0.0F, size, size, 0.0F, 1000.0F, farPlane),
            VertexSorting.ORTHOGRAPHIC_Z
        );
        var modelViewStack = RenderSystem.getModelViewStack();
        modelViewStack.pushMatrix();
        modelViewStack.translation(0.0F, 0.0F, 10000.0F - farPlane);
        RenderSystem.applyModelViewMatrix();
        Lighting.setupFor3DItems();

        RenderTarget target = null;
        ByteBufferBuilder sharedBuffer = null;
        GuiGraphics gfx = null;
        try {
            target = new TextureTarget(size, size, true, Minecraft.ON_OSX);
            target.setClearColor(0.0F, 0.0F, 0.0F, 0.0F);
            target.bindWrite(false);
            target.clear(Minecraft.ON_OSX);

            sharedBuffer = new ByteBufferBuilder(256 * 1024);
            MultiBufferSource.BufferSource bufferSource = MultiBufferSource.immediate(sharedBuffer);
            gfx = new GuiGraphics(mc, bufferSource);

            // GUI glyph is a 16px cell; scale it to ~90% of the requested tile.
            float fill = (size / 16.0F) * 0.9F;

            int rendered = 0;
            for (String id : itemIds) {
                if (rendered >= MAX_BATCH) break;
                ItemStack stack = makeStack(id);
                if (stack.isEmpty()) continue;

                target.clear(Minecraft.ON_OSX);
                try {
                    gfx.pose().pushPose();
                    gfx.pose().translate(size / 2.0F, size / 2.0F, 0.0F);
                    gfx.pose().scale(fill, fill, 1.0F);
                    gfx.renderItem(stack, -8, -8);
                    gfx.pose().popPose();
                    gfx.flush();

                    target.unbindWrite();
                    RenderSystem.bindTexture(target.getColorTextureId());
                    NativeImage img = new NativeImage(size, size, false);
                    img.downloadTexture(0, false);
                    String dataUrl = encodePng(img);
                    img.close();
                    if (dataUrl != null) {
                        out.addProperty(id, dataUrl);
                        rendered++;
                    }
                    target.bindWrite(false);
                } catch (Throwable t) {
                    LOGGER.warn("[ItemIconRenderer] Failed to render item {}: {}", id, t.toString());
                    target.bindWrite(false);
                }
            }
        } catch (Throwable t) {
            LOGGER.error("[ItemIconRenderer] Render pass failed", t);
        } finally {
            if (gfx != null) {
                try { gfx.flush(); } catch (Throwable ignore) { }
            }
            if (target != null) {
                target.unbindWrite();
                target.destroyBuffers();
            }
            modelViewStack.popMatrix();
            RenderSystem.applyModelViewMatrix();
            RenderSystem.restoreProjectionMatrix();
            if (sharedBuffer != null) {
                sharedBuffer.close();
            }
        }
        return out;
    }

    /** Build a count-1 ItemStack for an id, or empty for unknown/air ids. */
    private static ItemStack makeStack(String id) {
        try {
            ResourceLocation rl = ResourceLocation.tryParse(id);
            if (rl == null) return ItemStack.EMPTY;
            var item = BuiltInRegistries.ITEM.get(rl);
            if (item == null || item == Items.AIR) return ItemStack.EMPTY;
            return new ItemStack(item);
        } catch (Exception e) {
            return ItemStack.EMPTY;
        }
    }

    /**
     * Encode the downloaded texture as a base64 PNG data URL. GL textures are
     * stored bottom-up, so rows are flipped before encoding.
     */
    private static String encodePng(NativeImage src) {
        int w = src.getWidth();
        int h = src.getHeight();
        NativeImage flipped = new NativeImage(w, h, false);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                flipped.setPixelRGBA(x, y, src.getPixelRGBA(x, h - 1 - y));
            }
        }
        try {
            byte[] png = flipped.asByteArray();
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(png);
        } catch (Exception e) {
            LOGGER.warn("[ItemIconRenderer] PNG encode failed: {}", e.toString());
            return null;
        } finally {
            flipped.close();
        }
    }
}
