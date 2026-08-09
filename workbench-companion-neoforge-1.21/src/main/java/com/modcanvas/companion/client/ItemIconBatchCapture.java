package com.modcanvas.companion.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.ItemStack;
import org.joml.Vector3f;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL30;

import java.util.List;

/**
 * One grid pass of the offscreen icon capture (extracted s25 from
 * ItemIconRenderer): clear a cell grid, draw up to GRID*GRID items into
 * disjoint viewports, read the texture back once, and slice each cell into a
 * base64 PNG. Owns the pass-scoped light y-flip and its restore.
 */
public final class ItemIconBatchCapture {
    /** The game's GUI light directions with y negated — see the flip comment. */
    private static final Vector3f FLIPPED_LIGHT_0 = new Vector3f(-0.9334392F, 0.26269472F, -0.24430016F);
    private static final Vector3f FLIPPED_LIGHT_1 = new Vector3f(-0.10357137F, 0.9766068F, 0.18844642F);
    /** The game's unflipped GUI light directions (restore target). */
    private static final Vector3f GUI_LIGHT_0 = new Vector3f(-0.9334392F, -0.26269472F, -0.24430016F);
    private static final Vector3f GUI_LIGHT_1 = new Vector3f(-0.10357137F, -0.9766068F, 0.18844642F);

    private ItemIconBatchCapture() {
    }

    /**
     * Draw `stacks` (a slice of the full batch) into one grid pass and slice
     * the readback into `out` keyed by `validIds`.
     *
     * <p>s25 LIGHT-FLIP, pass-scoped: the game's GUI pipeline y-flips the pose
     * (scale(16,-16,16)) AND the light matrix (scaling(1,-1,1)) — both flips.
     * We keep an unflipped pose (s21 barrel lesson), so we must flip the
     * lights' y instead: dot(n, flipY(L)) == dot(flipY(n), L), verified
     * numerically. Set once per pass (NOT per item): a per-item flip raced the
     * game's own setupFor3DItems between items — measured ~50/50 flipped/
     * unflipped in one drain. The constants are the deterministic game lights
     * (normalize(0.2,1,-0.7) etc. through setupGui3DDiffuseLighting's matrix;
     * computed values match measured uniforms to 4 decimals) with y negated.
     * Restored on every exit path.</p>
     */
    public static void run(List<String> validIds, List<ItemStack> stacks, int start, int size,
                           float farPlane, RenderTarget target, JsonObject out) {
        int grid = ItemIconRenderer.GRID;
        int n = Math.min(grid * grid, stacks.size() - start);
        Minecraft mc = Minecraft.getInstance();
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
        RenderSystem.setShaderLights(FLIPPED_LIGHT_0, FLIPPED_LIGHT_1);
        boolean anyDrawn = false;
        for (int i = 0; i < n; i++) {
            int cellX = (i % grid) * size;
            int cellY = (i / grid) * size;
            // The viewport maps the item-local ortho [0,size] into
            // this cell's pixels; the item pose (which centers at
            // size/2, size/2) therefore lands in its own cell.
            GL30.glViewport(cellX, cellY, size, size);
            try {
                ItemIconRenderer.drawItemDirect(stacks.get(start + i), size, farPlane);
                anyDrawn = true;
            } catch (Throwable t) {
                ItemIconRenderer.LOGGER.warn("[ItemIconRenderer] Failed to render item {}: {}", validIds.get(start + i), t.toString());
            }
        }
        if (!anyDrawn) {
            // No items drawn: restore the pass-scoped light flip so the
            // game's next GUI draw sees its own lights.
            RenderSystem.setShaderLights(GUI_LIGHT_0, GUI_LIGHT_1);
            return;
        }

        // ONE readback per pass, then slice the cells into individual
        // icons. The whole pass shares the projection/filter state set
        // above — no per-item FBO cycle, no per-item GPU sync.
        int atlasSize = size * grid;
        target.unbindWrite();
        RenderSystem.bindTexture(target.getColorTextureId());
        NativeImage atlas = new NativeImage(atlasSize, atlasSize, false);
        atlas.downloadTexture(0, false);
        for (int i = 0; i < n; i++) {
            int cellX = (i % grid) * size;
            int cellY = (i / grid) * size;
            NativeImage slice = new NativeImage(size, size, false);
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) {
                    slice.setPixelRGBA(x, y, atlas.getPixelRGBA(cellX + x, cellY + y));
                }
            }
            String dataUrl = ItemIconRenderer.encodePng(slice);
            slice.close();
            if (dataUrl != null) {
                out.addProperty(validIds.get(start + i), dataUrl);
            }
        }
        atlas.close();
        target.bindWrite(false);
        // Restore the pass-scoped light flip (set before the item loop)
        // so the game's next GUI draw sees its own unflipped lights.
        RenderSystem.setShaderLights(GUI_LIGHT_0, GUI_LIGHT_1);
    }
}
