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
    // The game's GUI item lights: Lighting.setupFor3DItems passes
    // DIFFUSE_LIGHT_0/1 = normalize(0.2,1,-0.7) / normalize(-0.2,1,0.7)
    // through GlStateManager.setupGui3DDiffuseLighting, which transforms them
    // by scaling(-1, 1.0821041, 3.2375858) × rotateYXZ(-0.3926991, 2.3561945,
    // 0) before the per-face dot products (verified in the vanilla bytecode).
    // That rotation is what produces the game's left≠right asymmetry. The
    // effective directions were computed numerically:
    private static final Vector3f GUI_LIGHT_0 = new Vector3f(-0.57995F, 0.66172F, 0.47516F);
    private static final Vector3f GUI_LIGHT_1 = new Vector3f(0.57995F, 0.13192F, -0.80390F);

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
            RenderSystem.setShaderTexture(0, blockAtlas.getId());
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
                RenderSystem.setShaderTexture(0, blockAtlas.getId());
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, savedMinFilter[0]);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, savedMagFilter[0]);
            }
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
        try {
            mvStack.translation(0.0F, 0.0F, 10000.0F - farPlane);
            RenderSystem.applyModelViewMatrix();
            // Texture path: bind the block atlas and draw the quads with their
            // UVs AND per-face shade. Baked quads carry directional lighting in
            // the vertex color (BLOCK-format int 3): blocks are shaded ~0.5 (down)
            // to 1.0 (up) per face. Dropping it rendered every face full-bright —
            // the flat "no lighting" look. position_tex_color multiplies the
            // texture by the vertex color (the text-renderer shader) without
            // needing the lightmap texture, which the offscreen context never
            // binds.
            RenderSystem.setShader(GameRenderer::getPositionTexColorShader);
            if (RenderSystem.getShader() != null) {
                RenderSystem.getShader().apply();
            }
            RenderSystem.setShaderTexture(0,
                mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS).getId());
            RenderSystem.setShaderColor(1.0F, 1.0F, 1.0F, 1.0F); // clear any stale color modulator

            var tess = Tesselator.getInstance();
            var vb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
            // Block tints (grass/leaves/etc.) are applied at RENDER time, not
            // baked: the quads carry a tintIndex and vanilla multiplies the vertex
            // color by BlockColors. Without it, tinted blocks render their
            // untinted atlas base — grey grass. The world-less default color
            // (null world/pos) matches the game's GUI/quest-book rendering.
            BlockState tintState = stack.getItem() instanceof BlockItem
                ? Block.byItem(stack.getItem()).defaultBlockState()
                : null;
            BlockColors blockColors = Minecraft.getInstance().getBlockColors();
            // Per-face shading: the game's GUI item light (Lighting.setupFor3DItems)
            // = two directional lights normalize(0.2, 1.0, -0.7) /
            // normalize(-0.2, 1.0, 0.7), blended by light.glsl:
            //   min(1.0, (max(0,dot(L0,n)) + max(0,dot(L1,n))) * 0.6 + 0.4)
            // This gives top 1.0, z-faces ~0.74, x-faces ~0.50, bottom 0.4 —
            // the three distinct cube levels and the left≠right asymmetry the
            // game shows (a directional light, not the axis-symmetric vanilla
            // block shade). The normal comes from the baked quad (BLOCK int 8);
            // zero normals → ambient 0.4 only (safe).
            for (BakedQuad quad : quads) {
                int[] verts = quad.getVertices();
                int tintIndex = quad.getTintIndex();
                float tr = 1.0F, tg = 1.0F, tb = 1.0F;
                if (tintIndex >= 0 && tintState != null) {
                    int tint = blockColors.getColor(tintState, null, null, tintIndex);
                    tr = (tint >> 16 & 0xFF) / 255.0F;
                    tg = (tint >> 8 & 0xFF) / 255.0F;
                    tb = (tint & 0xFF) / 255.0F;
                }
                float shade = guiLightShade(verts);
                for (int i = 0; i < 4; i++) {
                    int o = stride * i;
                    float x = Float.intBitsToFloat(verts[o]);
                    float y = Float.intBitsToFloat(verts[o + 1]);
                    float z = Float.intBitsToFloat(verts[o + 2]);
                    // Vertex color int is 0xAABBGGRR; multiply RGB by tint × shade.
                    int color = verts[o + 3];
                    int a = color >>> 24;
                    int nr = (int) ((color & 0xFF) * tr * shade);
                    int ng = (int) ((color >> 8 & 0xFF) * tg * shade);
                    int nb = (int) ((color >> 16 & 0xFF) * tb * shade);
                    float u = Float.intBitsToFloat(verts[o + 4]);
                    float v = Float.intBitsToFloat(verts[o + 5]);
                    vb.addVertex(pose, x, y, z)
                        .setUv(u, v)
                        .setColor(a << 24 | nb << 16 | ng << 8 | nr);
                }
            }
            BufferUploader.drawWithShader(vb.build());
        } finally {
            // The stack MUST come back even when a draw throws: an unbalanced
            // push leaks one slot per failed item, and 16 leaks fill the
            // 16-slot Matrix4fStack — the next frame crashes ("max stack size
            // of 16 reached").
            mvStack.popMatrix();
            RenderSystem.applyModelViewMatrix();
        }
    }

    /** The game's GUI item-light factor for a baked quad, from its packed
     *  normal (BLOCK-format int 8: three signed bytes × 127). Mirrors
     *  light.glsl's minecraft_mix_light with the setupGui3DDiffuseLighting
     *  effective lights. The baked normal is negated: the quad normals read
     *  inverted (measured — the top face got the DOWN-level light), which
     *  matches the winding the model bakes. */
    private static float guiLightShade(int[] verts) {
        int n = verts[8];
        float nx = -(byte) (n & 0xFF) / 127.0F;
        float ny = -(byte) ((n >> 8) & 0xFF) / 127.0F;
        float nz = -(byte) ((n >> 16) & 0xFF) / 127.0F;
        float l0 = Math.max(0.0F, nx * GUI_LIGHT_0.x() + ny * GUI_LIGHT_0.y() + nz * GUI_LIGHT_0.z());
        float l1 = Math.max(0.0F, nx * GUI_LIGHT_1.x() + ny * GUI_LIGHT_1.y() + nz * GUI_LIGHT_1.z());
        return Math.min(1.0F, (l0 + l1) * 0.6F + 0.4F);
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
