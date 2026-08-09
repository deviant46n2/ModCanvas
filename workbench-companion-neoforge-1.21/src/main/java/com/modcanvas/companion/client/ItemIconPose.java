package com.modcanvas.companion.client;

import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.world.item.ItemDisplayContext;
import org.joml.Matrix4f;
import org.joml.Vector3f;

import java.util.List;

/**
 * Pure pose math for offscreen item-icon capture (extracted s25 from
 * ItemIconRenderer for the 300-line rule and testability). No GL state, no
 * RenderSystem, no Minecraft singleton — quads in, pose out. The ONLY source
 * of the capture-view pose: never derive the pose anywhere else, or the
 * normals-vs-lights contract below breaks silently.
 */
public final class ItemIconPose {
    private ItemIconPose() {
    }

    /**
     * Build the pose that renders a model's quads centered in a `size` cell.
     *
     * <p>Never assume a model's coordinate range (blocks span 0..16, custom
     * models 0..1) and never assume the display transform is identity.
     * Apply the GUI transform FIRST and measure the PROJECTED bounds, so
     * rotated models (e.g. a flat quad turned edge-on) fit correctly.</p>
     *
     * <p>s25 FIX (was scale(s,s,1)): the scale MUST be uniform. PoseStack.scale
     * applies the normal matrix (1/x,1/y,1/z) for non-uniform scales, so with
     * z=1 vs x/y=s every face normal collapsed to ~(0,0,±1),
     * dot(normal,light)≈0 → flat 0.4 shading on all faces (measured: normal
     * matrix y-row (0,0.0148,0.5) = 0.866/s; pixel-verified flat stone).
     * scale(s,s,s) keeps the normal matrix as the rotation → correct per-face
     * lighting. The game's own pose uses uniform-magnitude scale(16,-16,16).</p>
     *
     * <p>NOTE (s21, REVERTED): a y-flip here (scale(s,-s,1)) was tried to fix
     * "darkest face at top" — it broke geometry (barrel rendered upside down;
     * student ground truth). The capture view is NOT mirrored; the
     * shade-position mismatch lives in the SHADING side (the light y-flip in
     * ItemIconRenderer's pass loop), not this pose.</p>
     */
    public static PoseStack build(List<BakedQuad> quads, int size, BakedModel model) {
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
        poseStack.scale(s, s, s);
        poseStack.translate(-(minX + maxX) / 2.0F, -(minY + maxY) / 2.0F, 0.0F);
        model.getTransforms().getTransform(ItemDisplayContext.GUI).apply(false, poseStack);
        return poseStack;
    }
}
