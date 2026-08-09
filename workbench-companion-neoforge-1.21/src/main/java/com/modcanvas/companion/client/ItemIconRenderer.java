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
import net.minecraft.client.color.block.BlockColors;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.client.ClientHooks;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.lwjgl.opengl.GL11;
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
    private static final Logger LOGGER = LoggerFactory.getLogger("ItemIconRenderer");
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
                ItemStack stack = makeStack(id);
                if (stack.isEmpty()) continue;
                validIds.add(id);
                stacks.add(stack);
            }

            for (int start = 0; start < stacks.size(); start += GRID * GRID) {
                int n = Math.min(GRID * GRID, stacks.size() - start);
                target.clear(Minecraft.ON_OSX);
                // clear() drops the binding again — re-bind for THIS pass.
                GL30.glBindFramebuffer(GL30.GL_FRAMEBUFFER, target.frameBufferId);
                RenderSystem.disableCull();
                RenderSystem.disableBlend();
                // Depth ON: the buffer is cleared per pass and each cell is
                // drawn by exactly one item into a disjoint viewport region,
                // so cube faces occlude correctly per item without
                // painter's-order artifacts.
                RenderSystem.enableDepthTest();
                boolean anyDrawn = false;
                for (int i = 0; i < n; i++) {
                    int cellX = (i % GRID) * size;
                    int cellY = (i / GRID) * size;
                    // The viewport maps the item-local ortho [0,size] into
                    // this cell's pixels; the item pose (which centers at
                    // size/2, size/2) therefore lands in its own cell.
                    GL30.glViewport(cellX, cellY, size, size);
                    try {
                        drawItemDirect(stacks.get(start + i), size, farPlane);
                        anyDrawn = true;
                    } catch (Throwable t) {
                        LOGGER.warn("[ItemIconRenderer] Failed to render item {}: {}", validIds.get(start + i), t.toString());
                    }
                }
                if (!anyDrawn) {
                    continue;
                }

                // ONE readback per pass, then slice the cells into individual
                // icons. The whole pass shares the projection/filter state set
                // above — no per-item FBO cycle, no per-item GPU sync.
                target.unbindWrite();
                RenderSystem.bindTexture(target.getColorTextureId());
                NativeImage atlas = new NativeImage(atlasSize, atlasSize, false);
                atlas.downloadTexture(0, false);
                for (int i = 0; i < n; i++) {
                    int cellX = (i % GRID) * size;
                    int cellY = (i / GRID) * size;
                    NativeImage slice = new NativeImage(size, size, false);
                    for (int y = 0; y < size; y++) {
                        for (int x = 0; x < size; x++) {
                            slice.setPixelRGBA(x, y, atlas.getPixelRGBA(cellX + x, cellY + y));
                        }
                    }
                    String dataUrl = encodePng(slice);
                    slice.close();
                    if (dataUrl != null) {
                        out.addProperty(validIds.get(start + i), dataUrl);
                    }
                }
                atlas.close();
                target.bindWrite(false);
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
        // GUI item light/overlay, from the game's own GuiGraphics.renderItem
        // bytecode (verified): 0xF000F0 full-bright + NO_OVERLAY. The shade is
        // NOT baked here anymore — entity_cutout lights via the uniforms.
        int light = 0xF000F0;
        int overlay = net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY;
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
        // NOTE (s21, REVERTED): a y-flip here (scale(s,-s,1)) was tried to fix
        // "darkest face at top" — it broke geometry (barrel rendered upside
        // down; student ground truth). The capture view is NOT mirrored; the
        // shade-position mismatch lives in the SHADING side, not this pose.
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
        try {
            mvStack.translation(0.0F, 0.0F, 10000.0F - farPlane);
            RenderSystem.applyModelViewMatrix();
            // Texture path: bind the block atlas and draw the quads with their
            // UVs AND per-face shade. The baked vertex colors are WHITE for
            // vanilla block models — the game applies face shading from the
            // quad normals in its shaders, which position_tex_color has no
            // access to, so we apply the GUI item light ourselves via the
            // shade multiplier below (the flat state, shade = 1.0, looked
            // flat precisely because the colors carry no shade).
            // Approach B (s21 re-scope, experiment-verified): the game's own
            // shading path. entity_cutout reads the Light0/Light1 uniforms
            // (bound by setupFor3DItems at the top of render()) and lights each
            // vertex by its NORMAL — verified binding offscreen via [ITEM-EXP]
            // probe (5,625 confirmations). The manual shade table dies.
            RenderSystem.setShader(GameRenderer::getRendertypeEntityCutoutShader);
            var shader = RenderSystem.getShader();
            if (shader != null) {
                // The binding authority at draw time is the ShaderInstance's
                // sampler map: setSampler() populates it, apply() binds the
                // units from it. Raw glBindTexture AND the deferred
                // setShaderTexture array are both OVERRIDDEN by apply() (s21
                // cont.4, bytecode-verified) — that is why the earlier binds
                // changed nothing. Populate the map so the draw sees the
                // atlas (Sampler0), overlay (Sampler1), lightmap (Sampler2).
                Object overlaySampler = null;
                Object lightmapSampler = null;
                try {
                    var lt = mc.gameRenderer.lightTexture();
                    java.lang.reflect.Field lf = net.minecraft.client.renderer.LightTexture.class.getDeclaredField("lightTexture");
                    lf.setAccessible(true);
                    lightmapSampler = lf.get(lt);
                    var ot = mc.gameRenderer.overlayTexture();
                    java.lang.reflect.Field of = net.minecraft.client.renderer.texture.OverlayTexture.class.getDeclaredField("texture");
                    of.setAccessible(true);
                    overlaySampler = of.get(ot);
                } catch (Exception e10) {
                    LOGGER.warn("[ItemIconRenderer] Sampler reflection failed: {}", e10.toString());
                }
                shader.setSampler("Sampler0", mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS));
                shader.setSampler("Sampler1", overlaySampler);
                shader.setSampler("Sampler2", lightmapSampler);
                shader.apply();
            }
            RenderSystem.setShaderColor(1.0F, 1.0F, 1.0F, 1.0F); // clear any stale color modulator

            var tess = Tesselator.getInstance();
            // s21j FIX: the draw MUST use NEW_ENTITY, not BLOCK. The
            // entity_cutout shader declares `in ivec2 UV1` (overlay) and the
            // fragment shader mixes color with the overlay texel fetch —
            // `color.rgb = mix(overlayColor.rgb, color.rgb, overlayColor.a)`.
            // BLOCK has no UV1 (Position/Color/UV0/UV2/Normal per bytecode),
            // so the VAO feeds garbage UV1 -> texelFetch OOB -> (0,0,0,0) ->
            // mix() picks black -> EVERYTHING renders black. The game's own
            // quest-book path (ItemRenderer.renderQuadList -> entityCutout)
            // uses NEW_ENTITY (Position/Color/UV0/UV1/UV2/Normal), which is
            // why in-game icons are correct. putBulkData below already
            // receives `light, overlay`; NEW_ENTITY is what makes UV1 real.
            var vb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.NEW_ENTITY);
            // Block tints (grass/leaves/etc.) are applied at RENDER time, not
            // baked: the quads carry a tintIndex and vanilla multiplies the vertex
            // color by BlockColors. Without it, tinted blocks render their
            // untinted atlas base — grey grass. The world-less default color
            // (null world/pos) matches the game's GUI/quest-book rendering.
            BlockState tintState = stack.getItem() instanceof BlockItem
                ? Block.byItem(stack.getItem()).defaultBlockState()
                : null;
            BlockColors blockColors = Minecraft.getInstance().getBlockColors();
            // The pose the geometry renders with IS the pose whose normal matrix
            // the game uses for shading (PoseStack$Pose.transformNormal inside
            // putBulkData). No separate flipped gameStack — the mirror bug that
            // plagued the manual shade table cannot exist here by construction.
            var poseEntry = poseStack.last();
            for (BakedQuad quad : quads) {
                int tintIndex = quad.getTintIndex();
                float tr = 1.0F, tg = 1.0F, tb = 1.0F, ta = 1.0F;
                if (tintIndex >= 0 && tintState != null) {
                    int tint = blockColors.getColor(tintState, null, null, tintIndex);
                    ta = (tint >>> 24) / 255.0F;
                    tr = (tint >> 16 & 0xFF) / 255.0F;
                    tg = (tint >> 8 & 0xFF) / 255.0F;
                    tb = (tint & 0xFF) / 255.0F;
                }
                // The game's own vertex writer: baked direction -> normal ->
                // transformed by the render pose's normal matrix -> written as
                // the per-vertex normal. The entity_cutout shader then lights
                // that normal against the bound Light0/Light1 uniforms — the
                // exact quest-book mechanism (renderQuadList -> putBulkData).
                vb.putBulkData(poseEntry, quad, tr, tg, tb, ta, light, overlay);
            }
            BufferUploader.drawWithShader(vb.build());
        } finally {
            // The stack MUST come back even when a draw throws: an unbalanced
            // push leaks one slot per failed item, and 16 leaks fill the
            // 16-slot Matrix4fStack — the next frame crashes ("max stack size
            // of 16 reached"). The sampler teardown lives here too, so a
            // throwing draw can't leave units 1/2 bound to textures the next
            // RenderType didn't ask for.
            GL30.glActiveTexture(GL30.GL_TEXTURE1);
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, 0);
            GL30.glActiveTexture(GL30.GL_TEXTURE2);
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, 0);
            GL30.glActiveTexture(GL30.GL_TEXTURE0);
            mvStack.popMatrix();
            RenderSystem.applyModelViewMatrix();
        }
    }

    /** The game's GUI item-light factor for a baked quad (s12): REPLACED by the
     *  game's own shading path (s21 re-scope) — entity_cutout lights vertices
     *  by their baked normals against the Light0/Light1 uniforms; the manual
     *  shade table was removed (dead code). */

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
