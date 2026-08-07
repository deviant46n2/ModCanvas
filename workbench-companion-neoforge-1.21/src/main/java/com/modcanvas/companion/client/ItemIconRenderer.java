package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.blaze3d.vertex.VertexSorting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.client.ClientHooks;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.lwjgl.opengl.GL30;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
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
        // maps GUI depth into the visible range. The ortho near/far are
        // DISTANCES in front of the camera: near=1000 means view z=-1000, so
        // the translate must land geometry in NEGATIVE view z. Vanilla uses
        // translate = 10000 - farPlane (GameRenderer.guiRender). (A past
        // analysis claimed +1000 — positive view z is behind the camera, so
        // every quad silently clipped; the z-sweep proved only view z in
        // [-far, -1000] renders.)
        float farPlane = ClientHooks.getGuiFarPlane();
        RenderSystem.backupProjectionMatrix();
        Lighting.setupFor3DItems();

        RenderTarget target = null;
        try {
            target = new TextureTarget(size, size, true, Minecraft.ON_OSX);
            target.setClearColor(0.0F, 0.0F, 0.0F, 0.0F);
            target.bindWrite(false);
            target.clear(Minecraft.ON_OSX);
            // clear() ends with unbindWrite — re-bind the FBO so draws land in
            // the target, not the main window.
            GL30.glBindFramebuffer(GL30.GL_FRAMEBUFFER, target.frameBufferId);

            int rendered = 0;
            for (String id : itemIds) {
                if (rendered >= MAX_BATCH) break;
                ItemStack stack = makeStack(id);
                if (stack.isEmpty()) continue;

                target.clear(Minecraft.ON_OSX);
                // clear() drops the binding again — re-bind for THIS item.
                GL30.glBindFramebuffer(GL30.GL_FRAMEBUFFER, target.frameBufferId);
                try {
                    RenderSystem.disableCull();
                    RenderSystem.disableBlend();
                    // Depth ON: the target's depth buffer is cleared per item,
                    // so faces occlude correctly (cubes need this — no depth
                    // test means painter's-order artifacts at face overlaps).
                    RenderSystem.enableDepthTest();
                    drawItemDirect(stack, size, farPlane);

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
            if (target != null) {
                target.unbindWrite();
                target.destroyBuffers();
            }
            RenderSystem.restoreProjectionMatrix();
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

    /** Render an item stack by drawing its baked quads directly (no
     *  GuiGraphics/buffer source). Direct Tesselator + shader-apply +
     *  drawWithShader is the only draw path that works in this offscreen
     *  context; the flush path's deferred setShader never applies here. */
    private static void drawItemDirect(ItemStack stack, int size, float farPlane) {
        Minecraft mc = Minecraft.getInstance();
        ItemRenderer itemRenderer = mc.getItemRenderer();
        BakedModel model = itemRenderer.getModel(stack, null, null, 0);
        if (model == null) {
            return;
        }

        RandomSource random = RandomSource.create();
        // Vanilla iterates all 6 directions PLUS the null direction: cube
        // quads are filed by direction, null returns only direction-less
        // quads (crosses, flat cutouts). Seed 42 per call like ItemRenderer
        // does, so random-variant models render deterministically.
        List<BakedQuad> quads = new ArrayList<>();
        for (Direction direction : Direction.values()) {
            random.setSeed(42L);
            quads.addAll(model.getQuads(null, direction, random));
        }
        random.setSeed(42L);
        quads.addAll(model.getQuads(null, null, random));
        if (quads.isEmpty()) {
            return;
        }

        // Never assume a model's coordinate range (blocks span 0..16, custom
        // models 0..1) and never assume the display transform is identity.
        // Apply the GUI transform FIRST and measure the PROJECTED bounds, so
        // rotated models (e.g. a flat quad turned edge-on) fit correctly.
        int stride = DefaultVertexFormat.BLOCK.getVertexSize() / 4; // bytes -> ints
        PoseStack guiStack = new PoseStack();
        model.getTransforms().getTransform(ItemDisplayContext.GUI).apply(false, guiStack);
        Matrix4f gui = new Matrix4f(guiStack.last().pose());
        Vector3f p = new Vector3f();
        float minX = Float.MAX_VALUE, maxX = -Float.MAX_VALUE;
        float minY = Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (BakedQuad quad : quads) {
            int[] verts = quad.getVertices();
            for (int i = 0; i < 4; i++) {
                int o = stride * i;
                p.set(Float.intBitsToFloat(verts[o]), Float.intBitsToFloat(verts[o + 1]), Float.intBitsToFloat(verts[o + 2]));
                gui.transformPosition(p);
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            }
        }
        float w = maxX - minX, h = maxY - minY;
        float s = Math.min(size / w, size / h) * 0.9F;

        PoseStack poseStack = new PoseStack();
        poseStack.translate(size / 2.0F, size / 2.0F, 150.0F);
        poseStack.scale(s, s, 1.0F);
        poseStack.translate(-(minX + maxX) / 2.0F, -(minY + maxY) / 2.0F, 0.0F);
        model.getTransforms().getTransform(ItemDisplayContext.GUI).apply(false, poseStack);
        Matrix4f pose = new Matrix4f(poseStack.last().pose());

        // Assert the GUI matrices before the draw: the shader transforms the
        // pose-baked vertices by ProjMat * ModelViewMat ON TOP of the baked
        // pose — without our ortho + translate the item renders under the
        // window projection and clips below the near plane.
        RenderSystem.setProjectionMatrix(
            new Matrix4f().setOrtho(0.0F, size, size, 0.0F, 1000.0F, farPlane),
            VertexSorting.ORTHOGRAPHIC_Z
        );
        var mvStack = RenderSystem.getModelViewStack();
        mvStack.pushMatrix();
        mvStack.translation(0.0F, 0.0F, 10000.0F - farPlane);
        RenderSystem.applyModelViewMatrix();
        // Texture path: bind the block atlas and draw the quads with their
        // UVs through position_tex.
        RenderSystem.setShader(GameRenderer::getPositionTexShader);
        if (RenderSystem.getShader() != null) {
            RenderSystem.getShader().apply();
        }
        RenderSystem.setShaderTexture(0,
            mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS).getId());
        RenderSystem.setShaderColor(1.0F, 1.0F, 1.0F, 1.0F); // clear any stale color modulator

        var tess = Tesselator.getInstance();
        var vb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
        for (BakedQuad quad : quads) {
            int[] verts = quad.getVertices();
            for (int i = 0; i < 4; i++) {
                int o = stride * i;
                float x = Float.intBitsToFloat(verts[o]);
                float y = Float.intBitsToFloat(verts[o + 1]);
                float z = Float.intBitsToFloat(verts[o + 2]);
                float u = Float.intBitsToFloat(verts[o + 4]);
                float v = Float.intBitsToFloat(verts[o + 5]);
                vb.addVertex(pose, x, y, z).setUv(u, v);
            }
        }
        BufferUploader.drawWithShader(vb.build());
        mvStack.popMatrix();
        RenderSystem.applyModelViewMatrix();
    }

    /**
     * Encode the downloaded texture as a base64 PNG data URL. The readback is
     * already upright (same ortho + atlas conventions as vanilla's GUI pass),
     * so no row flip is applied.
     */
    private static String encodePng(NativeImage src) {
        try {
            byte[] png = src.asByteArray();
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(png);
        } catch (Exception e) {
            LOGGER.warn("[ItemIconRenderer] PNG encode failed: {}", e.toString());
            return null;
        }
    }
}
