package com.modcanvas.companion.client;

import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.MinecraftServer;
import net.neoforged.fml.ModList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Direct FTB Quests reload through its own API, reflectively.
 *
 * Why not the command (s56): FTB Quests 2101.1.31 changed
 * {@code PermissionsHelper.hasEditorPermission(CommandSourceStack)} to require
 * {@code source.isPlayer()} — the console-dispatch path (s43) no longer
 * passes, and a non-op player fails too (the fallback permission provider
 * returns false for everything). The permission gate guards only the COMMAND
 * literal; {@code ServerQuestFile.INSTANCE.load(ZZ)} is public API. The
 * companion is a server-side mod with full access — it calls the API directly
 * instead of impersonating a player (student ruling s56: soft dep on FTB
 * Quests, a stopgap until ModCanvas designs its own quest system).
 *
 * Soft-dep mechanics: no compile-time FTB jars. FTB's mods are All Rights
 * Reserved — vendoring them into the repo would distribute FTB's code in the
 * artifact (rejected). No reachable maven serves them (FTB maven layout
 * opaque; not on Modrinth; curse-maven needs a CF file id we can't resolve
 * keylessly). So the bridge uses reflection, the same pattern the companion
 * already uses for the quest-book open check — guarded by
 * {@code ModList.isLoaded("ftbquests")} + class-presence checks. Any missing
 * piece logs and returns false — the app's evidence gate then reports FAIL
 * honestly (a reload is never claimed).
 *
 * Mirrors FTB's own {@code doReload} steps 1-2: {@code load(true,true)} (which
 * logs the "Loading quests from" evidence line) + the SyncQuestsMessage
 * broadcast so clients re-read the quest data. The per-player
 * editor-permission + translation sync (doReload step 3) is deliberately NOT
 * replicated — the wedge edits from the app, not in-game, so those syncs have
 * no consumer here; noted as a limitation rather than adding fragile surface.
 *
 * Version boundary (verified by decompile, 2026-08-14): the API shape is
 * stable across 2101.1.23 → 2101.1.31 — INSTANCE field, load(ZZ), the
 * SyncQuestsMessage(BaseQuestFile) ctor, and NetworkHelper.sendToAll all
 * public. Re-verify on any FTB version bump.
 */
final class FtbQuestsReloadBridge {
    private static final Logger LOGGER = LoggerFactory.getLogger("FtbQuestsReloadBridge");

    private FtbQuestsReloadBridge() {
    }

    /** Reload the FTB Quests quest file on the server thread. Returns true
     *  when the reload was dispatched through FTB's own API (the app verifies
     *  the evidence line independently); false when FTB is absent or a
     *  reflection step failed — the caller must NOT claim success. */
    static boolean reloadQuests(MinecraftServer server) {
        if (!ModList.get().isLoaded("ftbquests")) {
            LOGGER.warn("[FtbQuestsReloadBridge] ftbquests not loaded — no direct reload");
            return false;
        }
        try {
            Class<?> sqfClass = Class.forName("dev.ftb.mods.ftbquests.quest.ServerQuestFile");
            Object questFile = sqfClass.getField("INSTANCE").get(null);
            sqfClass.getMethod("load", boolean.class, boolean.class).invoke(questFile, true, true);

            // doReload step 2: broadcast the sync so clients re-read the data.
            Class<?> baseFileClass = Class.forName("dev.ftb.mods.ftbquests.quest.BaseQuestFile");
            Class<?> msgClass = Class.forName("dev.ftb.mods.ftbquests.net.SyncQuestsMessage");
            Object syncMsg = msgClass.getConstructor(baseFileClass).newInstance(questFile);
            Class<?> netHelper = Class.forName("dev.ftb.mods.ftblibrary.util.NetworkHelper");
            netHelper.getMethod("sendToAll", MinecraftServer.class, CustomPacketPayload.class)
                .invoke(null, server, syncMsg);

            LOGGER.info("[FtbQuestsReloadBridge] Direct quest reload dispatched via FTB API");
            return true;
        } catch (ReflectiveOperationException e) {
            LOGGER.error("[FtbQuestsReloadBridge] Direct reload failed: {}", e.toString());
            return false;
        }
    }
}
