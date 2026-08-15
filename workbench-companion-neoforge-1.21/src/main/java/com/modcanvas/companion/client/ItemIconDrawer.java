package com.modcanvas.companion.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.blaze3d.vertex.VertexSorting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.color.block.BlockColors;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.client.extensions.common.IClientItemExtensions;
import org.joml.Matrix4f;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL30;

import java.util.ArrayList;
import java.util.List;

/**
 * The direct quad-draw path for the offscreen icon capture (extracted s36
 * from ItemIconRenderer for the 300-line rule): draws a model's baked quads
 * with the entity_cutout shader into the capture viewport. ItemIconRenderer
 * keeps a package-visible delegate so ItemIconBatchCapture's call site is
 * unchanged.
 */
final class ItemIconDrawer {
    private ItemIconDrawer() {
    }

    /** The game's GUI item-light factor for a baked quad (s12): REPLACED by the
     *  game's own shading path (s21 re-scope) — entity_cutout lights vertices
     *  by their baked normals against the Light0/Light1 uniforms; the manual
     *  shade table was removed (dead code). */

    /** s61 PARITY FIX: render a BuiltInModel (custom-renderer) item by porting
     *  the game's own BEWLR dispatch (ItemRenderer.renderItem, NeoForge
     *  1.21.1): IClientItemExtensions.of(stack).getCustomRenderer()
     *  .renderByItem(stack, GUI, pose, bufferSource, light, overlay). This is
     *  what draws banners/shulkers/beds/chests/skulls and modded custom
     *  renderers — the raw-quads path cannot (their getQuads is empty). Must
     *  be called on the render thread with the capture FBO + projection bound
     *  (the same state the baked path sets before drawing), and the buffer
     *  source MUST be flushed to actually emit into the FBO. */
    private static void renderCustomModel(ItemRenderer itemRenderer, ItemStack stack, BakedModel model,
                                          int size, float farPlane) {
        Minecraft mc = Minecraft.getInstance();
        int light = 0xF000F0;
        int overlay = net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY;

        try {
            // Mirror the game's renderItem GUI pose (ItemIconPose.build
            // philosophy): apply the model's GUI display transform, center the
            // box, uniform-scale to fit. BEWLR models are authored at 0..1
            // block scale (a banner/shulker/bed/chest is one unit), centered at
            // the model base after the game's translate(-0.5). We cannot
            // measure-bounds-fit like the baked path (BuiltInModel has no
            // quads), so use the fixed block-scale factor the baked path's
            // 0.9F-margin implies for a 1-unit model. Uniform scale keeps the
            // normal matrix sane (s25: non-uniform scale collapses normals).
            PoseStack pose = new PoseStack();
            float s = size * 0.9F; // 1-unit block filling the cell, 10% margin
            pose.translate(size / 2.0F, size / 2.0F, 150.0F);
            pose.scale(s, s, s);
            pose.translate(-0.5F, -0.5F, 0.0F);
            model.getTransforms().getTransform(ItemDisplayContext.GUI).apply(false, pose);
            // Use the SAME buffer-source pattern the game uses (1.21.1):
            // immediate() backed by a ByteBufferBuilder we own and flush with
            // endBatch() so the submitted vertices emit into our bound FBO.
            MultiBufferSource.BufferSource bufferSource =
                MultiBufferSource.immediate(new com.mojang.blaze3d.vertex.ByteBufferBuilder(256));
            var blockEntityRenderer = itemRenderer.getBlockEntityRenderer();
            // Mirror the game's GUI item texture state BEFORE renderByItem —
            // otherwise BEWLR shaders sample garbage light/overlay and render
            // solid black (the s21 "solid black until Sampler1/2 bound" bug).
            // BEWLR renderers bind their OWN material/shader per RenderType,
            // so unit 0's atlas is theirs; but units 1 (overlay) and 2
            // (lightmap) are GLOBAL state read by every item shader, exactly
            // as the baked path sets them up below.
            RenderSystem.setShaderTexture(0, mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS).getId());
            mc.gameRenderer.lightTexture().turnOnLightLayer();       // unit 2 (lightmap)
            mc.gameRenderer.overlayTexture().setupOverlayColor();    // unit 1 (overlay)
            var mvStack2 = RenderSystem.getModelViewStack();
            // Assert projection (same as baked path) BEFORE the render works.
            RenderSystem.setProjectionMatrix(
                new Matrix4f().setOrtho(0.0F, size, size, 0.0F, 1000.0F, farPlane),
                VertexSorting.ORTHOGRAPHIC_Z
            );
            mvStack2.pushMatrix();
            try {
                mvStack2.translation(0.0F, 0.0F, 10000.0F - farPlane);
                RenderSystem.applyModelViewMatrix();
                blockEntityRenderer.renderByItem(stack, ItemDisplayContext.GUI, pose, bufferSource, light, overlay);
                bufferSource.endBatch();
            } finally {
                // Teardown mirrors the baked path: restore the game's model-view
                // and lightmap/overlay units so the next frame is unaffected.
                mvStack2.popMatrix();
                RenderSystem.applyModelViewMatrix();
                GL30.glActiveTexture(GL30.GL_TEXTURE1);
                GL11.glBindTexture(GL11.GL_TEXTURE_2D, 0);
                GL30.glActiveTexture(GL30.GL_TEXTURE2);
                GL11.glBindTexture(GL11.GL_TEXTURE_2D, 0);
                GL30.glActiveTexture(GL30.GL_TEXTURE0);
                mc.gameRenderer.lightTexture().turnOffLightLayer();
                mc.gameRenderer.overlayTexture().teardownOverlayColor();
            }
        } catch (Throwable t) {
            ItemIconRenderer.LOGGER.error("[ItemIconDrawer] renderByItem failed for {}",
                net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()), t);
        }
    }

    /** Render an item stack by drawing its baked quads directly (no
     *  GuiGraphics/buffer source). Direct Tesselator + shader-apply +
     *  drawWithShader is the only draw path that works in this offscreen
     *  context; the flush path's deferred setShader never applies here. */
    static void drawItemDirect(ItemStack stack, int size, float farPlane) {
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

        // s61 PARITY FIX (fidelity arc): a BuiltInModel (banner/shulker/bed/
        // chest/head/skull/conduit/shield/decorated pot + any modded custom
        // renderer) has NO baked quads in getQuads — its visual is produced by
        // the game's BlockEntityWithoutLevelRenderer dispatch. ItemRenderer.java
        // (NeoForge 1.21.1, decompiled) gates on `model.isCustomRenderer()`:
        //   if (!model.isCustomRenderer()) -> renderModelLists(getQuads)
        //   else                          -> IClientItemExtensions.of(stack)
        //                                   .getCustomRenderer().renderByItem(...)
        // We must mirror that exactly: the raw-quads path below cannot render
        // BuiltInModel items (they blank). Port the game's BEWLR branch so the
        // icon capture renders EVERY item id the game can — modded textures
        // included, since mods hook the same IClientItemExtensions.
        if (model.isCustomRenderer()) {
            renderCustomModel(itemRenderer, stack, model, size, farPlane);
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

        // Pure pose math (bounds measurement + uniform-scale + GUI transform):
        // extracted to ItemIconPose for the 300-line rule and testability.
        // See ItemIconPose.build for the s25 uniform-scale history.
        PoseStack poseStack = ItemIconPose.build(quads, size, model);

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
                // The binding authority at DRAW time is the deferred
                // shaderTextures[] array, NOT the ShaderInstance sampler map:
                // BufferUploader.drawWithShader -> ShaderInstance.setDefaultUniforms
                // reads RenderSystem.getShaderTexture(i) and OVERWRITES every
                // sampler entry from it, then apply() binds from the clobbered
                // map (s25, decompiled-verified). setSampler() calls are dead
                // here — the draw clobbers them. Mirror the game's own flush
                // path by populating the deferred array via its PUBLIC API —
                // no reflection (a field rename in any MC update would
                // silently break the old reflection path; the game exposes
                // exactly the calls we need).
                RenderSystem.setShaderTexture(0, mc.getModelManager().getAtlas(InventoryMenu.BLOCK_ATLAS).getId());
                mc.gameRenderer.lightTexture().turnOnLightLayer();       // unit 2 (lightmap)
                mc.gameRenderer.overlayTexture().setupOverlayColor();    // unit 1 (overlay)
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
            // s25: restore the DEFERRED array too. setDefaultUniforms reads it
            // at the next draw and would bind our atlas/lightmap into the
            // game's next RenderType flush. Use the game's own public teardown
            // (mirrors the setup via turnOnLightLayer/setupOverlayColor above).
            mc.gameRenderer.lightTexture().turnOffLightLayer();
            mc.gameRenderer.overlayTexture().teardownOverlayColor();
            mvStack.popMatrix();
            RenderSystem.applyModelViewMatrix();
        }
    }
}
