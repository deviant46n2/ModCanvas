package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;
import net.neoforged.neoforge.client.ClientHooks;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL30;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
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
 * which satisfies that. All GL state (projection matrix, model-view stack,
 * viewport, texture filters, and the bound framebuffer) is backed up and
 * restored so the game's next frame is unaffected.
 *
 * <p>Items are rendered in a {@code GRID}×{@code GRID} batch per pass: one
 * FBO clear, one draw per cell (viewport-confined), ONE readback, then the
 * cells are sliced into individual PNGs. Per-item readbacks were the drain
 * bottleneck — a {@code downloadTexture} is a synchronous GPU sync, so a
 * full-pack drain was ~one sync per icon.
 */
public final class ItemIconRenderer {
    // Package-visible: ItemIconBatchCapture logs through this so the
    // [ItemIconRenderer] tag (referenced by docs and probe instrumentation)
    // stays stable across the s25 extraction.
    static final Logger LOGGER = LoggerFactory.getLogger("ItemIconRenderer");
    // HISTORICAL (s21 re-scope): the manual GUI-light constants
    // L0=(-0.9334392,-0.26269472,-0.24430016) L1=(-0.10357137,-0.9766068,0.18844642)
    // were verified three independent ways (bytecode transform, live uniform
    // probe, live GUI render) and REMOVED because they are now redundant: the
    // entity_cutout shader reads those same uniforms itself and lights vertices
    // by their baked normals — the game's own path. The trail is preserved in
    // git history and the code:session memory.

    /** Icon tile size ModCanvas asks for; matches the baked-icon output size. */
    public static final int DEFAULT_SIZE = 64;
    /** Batch cap: prevents a single tick from rendering an unbounded list. */
    public static final int MAX_BATCH = 64;
    /** Grid cells per side of the capture FBO. GRID² items share one render
     *  pass and ONE readback — a `downloadTexture` is a synchronous GPU sync,
     *  and per-item readbacks were the full-pack drain bottleneck (29k syncs
     *  for a pack ≈ 30 minutes; GRID=4 cuts that to one sync per 16 items). */
    public static final int GRID = 4;

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
        // Declared at method scope: the finally block restores the filters and
        // needs these outside the try.
        int[] savedMinFilter = new int[1];
        int[] savedMagFilter = new int[1];
        boolean filterOverridden = false;
        TextureAtlas blockAtlas = mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS);
        // Cells set the viewport per item; the game's viewport must come back.
        int[] savedViewport = new int[4];
        GL11.glGetIntegerv(GL11.GL_VIEWPORT, savedViewport);
        // s21 cont.4 (state-leak bug): the pass sets blend/cull/depth below and
        // the finally MUST restore them — leaving depth ON after a capture
        // depth-rejects the quest book's GUI draws (the "refresh bug": the book
        // re-draws with icons discarded). The method doc claims all state is
        // restored; it was not — this is the fix.
        boolean blendWasEnabled = GL11.glIsEnabled(GL11.GL_BLEND);
        boolean cullWasEnabled = GL11.glIsEnabled(GL11.GL_CULL_FACE);
        boolean depthWasEnabled = GL11.glIsEnabled(GL11.GL_DEPTH_TEST);
        try {
            int atlasSize = size * GRID;
            target = new TextureTarget(atlasSize, atlasSize, true, Minecraft.ON_OSX);
            target.setClearColor(0.0F, 0.0F, 0.0F, 0.0F);
            target.bindWrite(false);
            target.clear(Minecraft.ON_OSX);
            // clear() ends with unbindWrite — re-bind the FBO so draws land in
            // the target, not the main window.
            GL30.glBindFramebuffer(GL30.GL_FRAMEBUFFER, target.frameBufferId);

            // The block atlas is mipmapped and filtered for IN-WORLD
            // minification (smoothing distant terrain). Icon capture is pure
            // magnification — a 16px sprite stretched over a ~58px FBO — where
            // mipmap sampling can only corrupt the pixels: when the LOD lands
            // on mip 1-2 the GPU upscales a downsampled sprite (blur). Force
            // mip-0 NEAREST for the capture (the game's GUI samples the atlas
            // with nearest too, so a 16px sprite reads crisp like the quest
            // book) and restore the game's filters after.
            // s21 cont.4 (deferred-bind bug): RenderSystem.setShaderTexture only
            // writes the deferred shaderTextures[] array — the flush path
            // consumes it, the raw offscreen draw NEVER applies it (s9b
            // cousin). Bind the atlas IMMEDIATELY so the filter calls below hit
            // the atlas and the draw samples it, not whatever unit 0 held.
            GL30.glActiveTexture(GL30.GL_TEXTURE0);
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, blockAtlas.getId());
            GL11.glGetTexParameteriv(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, savedMinFilter);
            GL11.glGetTexParameteriv(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, savedMagFilter);
            GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, GL11.GL_NEAREST);
            GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_NEAREST);
            filterOverridden = true;

            // Resolve stacks up front (skipping empties) so each grid pass can
            // pair every cell with its original id.
            List<String> validIds = new ArrayList<>();
            List<ItemStack> stacks = new ArrayList<>();
            for (String id : itemIds) {
                if (stacks.size() >= MAX_BATCH) break;
                ItemStack stack = ItemIconStacks.makeStack(id);
                if (stack.isEmpty()) continue;
                validIds.add(id);
                stacks.add(stack);
            }

            for (int start = 0; start < stacks.size(); start += GRID * GRID) {
                ItemIconBatchCapture.run(validIds, stacks, start, size, farPlane, target, out);
            }
        } catch (Throwable t) {
            LOGGER.error("[ItemIconRenderer] Render pass failed", t);
        } finally {
            GL30.glViewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);
            if (filterOverridden) {
                GL30.glActiveTexture(GL30.GL_TEXTURE0);
                GL11.glBindTexture(GL11.GL_TEXTURE_2D, blockAtlas.getId());
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, savedMinFilter[0]);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, savedMagFilter[0]);
            }
            // Restore the blend/cull/depth state the pass changed — leaving
            // depth ON breaks the game's GUI (quest book icons depth-rejected).
            if (blendWasEnabled) RenderSystem.enableBlend(); else RenderSystem.disableBlend();
            if (cullWasEnabled) RenderSystem.enableCull(); else RenderSystem.disableCull();
            if (depthWasEnabled) RenderSystem.enableDepthTest(); else RenderSystem.disableDepthTest();
            if (target != null) {
                target.unbindWrite();
                target.destroyBuffers();
            }
            RenderSystem.restoreProjectionMatrix();
        }
        return out;
    }

    /** Package-visible delegate: ItemIconBatchCapture calls this
     *  directly; implementation moved to ItemIconDrawer (s36 split). */
    static void drawItemDirect(ItemStack stack, int size, float farPlane) {
        ItemIconDrawer.drawItemDirect(stack, size, farPlane);
    }

    /** Package-visible delegate: ItemIconBatchCapture calls this
     *  directly; implementation moved to ItemIconPng (s36 split). */
    static String encodePng(NativeImage src) {
        return ItemIconPng.encodePng(src);
    }
}
