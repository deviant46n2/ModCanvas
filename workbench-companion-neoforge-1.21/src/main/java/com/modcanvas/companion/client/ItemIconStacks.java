package com.modcanvas.companion.client;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Item id resolution for the icon capture pipeline (extracted s36 from
 * ItemIconRenderer for the 300-line rule).
 */
final class ItemIconStacks {
    private ItemIconStacks() {
    }

    /** Build a count-1 ItemStack for an id, or empty for unknown/air ids. */
    static ItemStack makeStack(String id) {
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
}
