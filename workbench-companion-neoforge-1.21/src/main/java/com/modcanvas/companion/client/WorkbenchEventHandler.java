package com.modcanvas.companion.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class WorkbenchEventHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger("WorkbenchEventHandler");

    /** Wait for the CLIENT to apply the reload sync before reopening the book:
     *  the sync packet arrives a few ms after the server reload completes, and
     *  reopening during it renders the book's locked/not-ready state (s43c). */
    private static final long QUEST_BOOK_REOPEN_DELAY_MS = 600;
    private static final ScheduledExecutorService reopenScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "workbench-quest-book-reopen");
        t.setDaemon(true);
        return t;
    });

    public static void handleEvent(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Processing event: {}", event);

        if (event.eventType.equals("RENDER_ITEMS_REQUEST")) {
            // Item rendering does not need a world/player; handled first so it
            // also works from the main menu.
            handleRenderItems(event);
            return;
        }

        if (event.eventType.equals("EXTRACT_TEXTURES_REQUEST")) {
            // ResourceManager lookup + PNG encode does not need a world/player.
            AssetExporter.extract(event);
            return;
        }

        if (event.eventType.equals("STOP_INSTANCE")) {
            // Graceful shutdown: the same stop() the game's quit button calls
            // (saves worlds, flushes, then exits). Works from the main menu.
            // External knowledge: Minecraft.stop() is Mojang-mapped in 1.21.1;
            // verified by the compile against the game jar.
            LOGGER.info("[WorkbenchEventHandler] STOP_INSTANCE — shutting down game");
            Minecraft.getInstance().stop();
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            LOGGER.warn("[WorkbenchEventHandler] Player is null, cannot execute command");
            return;
        }

        switch (event.eventType) {
            case "RELOAD_QUESTS" -> handleQuestReload(event);
            case "RELOAD_KUBEJS_SCRIPTS" -> handleKubeJSReload(event);
            case "RELOAD_CRAFTTWEAKER" -> handleCraftTweakerReload(event);
            case "RELOAD_CONFIG" -> handleConfigReload(event);
            case "RELOAD_PROGRESSION" -> handleProgressionReload(event);
            case "RELOAD_ALL" -> handleReloadAll(event);
            default -> LOGGER.warn("[WorkbenchEventHandler] Unknown event type: {}", event.eventType);
        }
    }

    /** Queue a batch of item ids for in-game rendering. Results stream back as
     * a single {@code RENDER_ITEMS_RESULT} once the queue drains (see
     * {@link ItemRenderQueue}). */
    private static void handleRenderItems(WorkbenchCompanionClient.WorkbenchEvent event) {
        JsonObject payload = event.payload != null ? event.payload : new JsonObject();
        String requestId = payload.has("requestId") ? payload.get("requestId").getAsString() : null;
        int size = payload.has("size") ? payload.get("size").getAsInt() : ItemIconRenderer.DEFAULT_SIZE;

        List<String> items = new ArrayList<>();
        JsonElement itemsEl = payload.get("items");
        if (itemsEl != null && itemsEl.isJsonArray()) {
            for (JsonElement el : itemsEl.getAsJsonArray()) {
                if (el.isJsonPrimitive() && el.getAsJsonPrimitive().isString()) {
                    items.add(el.getAsString());
                }
            }
        }

        if (items.isEmpty()) {
            LOGGER.info("[WorkbenchEventHandler] RENDER_ITEMS_REQUEST with no items; ignoring");
            return;
        }

        ItemRenderQueue.enqueue(items, requestId, size);
        LOGGER.info("[WorkbenchEventHandler] Queued {} items for engine rendering", items.size());
    }

    private static void handleQuestReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading quests from: {}", path);

        Minecraft mc = Minecraft.getInstance();
        boolean questBookOpen = isQuestBookOpen(mc);
        if (questBookOpen) {
            // A reload while the quest book is open leaves the open GUI holding
            // stale chapter references — every chapter renders a red X until
            // reopened (FTB does not refresh an open QuestScreen). Close it so
            // the reopen below shows fresh data. The check is QuestScreen-exact:
            // never close other screens (inventory, chests).
            mc.setScreen(null);
            LOGGER.info("[WorkbenchEventHandler] Quest book was open — closed for reload");
        }

        sendCommand("ftbquests reload");
        if (questBookOpen) {
            // Reopen AFTER the reload fully lands: the reload command runs
            // synchronously on the server thread, so a chained server.execute
            // runs once the quest data is re-parsed — then an off-thread delay
            // lets the CLIENT apply the reload sync before the book opens
            // (reopening during the sync rendered the locked/not-ready state,
            // s43c). The reopen itself uses FTB's openGui (the keybind's path)
            // rather than the open_book command.
            reopenQuestBook();
        }
        // No success toast here, by design (P2-HOTSWAP): the companion cannot
        // verify the reload (it cannot read its own process's log). Claiming
        // success without evidence was the lie the app's evidence loop exists
        // to kill — the app watches the game log for FTB's "Loading quests
        // from" line and reports PASS/FAIL. Note: dispatch now goes through
        // the server's own command source (console op level), so FTB's
        // editor-permission gate no longer blocks this path.
    }

    /** True when the client's current screen is FTB Quests' quest book. FTB
     *  Library wraps its entire GUI tree in a vanilla {@code ScreenWrapper} —
     *  the book's {@code QuestScreen} is an FTB Library {@code BaseScreen},
     *  never the vanilla {@code Screen} itself (s43b: the first check matched
     *  the wrapper's own class and always returned false). Resolve the wrapped
     *  gui reflectively so the companion stays FTB-agnostic (no hard dep);
     *  a missing/renamed ScreenWrapper degrades to "not open", never a crash. */
    private static boolean isQuestBookOpen(Minecraft mc) {
        if (mc.screen == null) return false;
        Class<?> screenClass = mc.screen.getClass();
        if (!screenClass.getName().equals("dev.ftb.mods.ftblibrary.ui.ScreenWrapper")) return false;
        try {
            Object gui = screenClass.getMethod("getGui").invoke(mc.screen);
            if (gui == null) return false;
            return gui.getClass().getName()
                .equals("dev.ftb.mods.ftbquests.client.gui.quests.QuestScreen");
        } catch (ReflectiveOperationException e) {
            LOGGER.warn("[WorkbenchEventHandler] isQuestBookOpen reflection failed: {}", e.toString());
            return false;
        }
    }

    /** Reopen the quest book for the local player after the reload has fully
     *  landed. Singleplayer: chained on the server thread (runs after the
     *  reload command returns), then delayed off-thread for the client sync,
     *  then opened client-side. Multiplayer / no integrated server: no
     *  server-thread anchor, so the delay starts now — best effort. */
    private static void reopenQuestBook() {
        Minecraft mc = Minecraft.getInstance();
        MinecraftServer server = mc.getSingleplayerServer();
        if (server != null && mc.player != null) {
            server.execute(() -> scheduleReopen(mc));
        } else if (mc.player != null) {
            scheduleReopen(mc);
        }
    }

    private static void scheduleReopen(Minecraft mc) {
        reopenScheduler.schedule(
            () -> mc.execute(WorkbenchEventHandler::openQuestBookClientSide),
            QUEST_BOOK_REOPEN_DELAY_MS, TimeUnit.MILLISECONDS);
    }

    /** Open the quest book the same way the keybind does — FTB's static
     *  {@code FTBQuestsClient.openGui()} — resolved reflectively so the
     *  companion stays FTB-agnostic (no hard dependency). Guards: skip if the
     *  player is gone or the user opened another screen during the delay —
     *  EXCEPT the vanilla pause menu, which auto-opens on window focus loss
     *  (the user is saving from the app; the game window is unfocused). The
     *  pause menu is an automatic screen, not a choice, so reopen over it.
     *  The skip log carries the screen class as a built-in instrument. */
    private static void openQuestBookClientSide() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            LOGGER.info("[WorkbenchEventHandler] Skipped quest book reopen (player gone)");
            return;
        }
        if (mc.screen != null && !(mc.screen instanceof PauseScreen)) {
            LOGGER.info("[WorkbenchEventHandler] Skipped quest book reopen (screen busy: {})",
                mc.screen.getClass().getName());
            return;
        }
        try {
            Class<?> client = Class.forName("dev.ftb.mods.ftbquests.client.FTBQuestsClient");
            client.getMethod("openGui").invoke(null);
            LOGGER.info("[WorkbenchEventHandler] Quest book reopened (client openGui)");
        } catch (ReflectiveOperationException e) {
            LOGGER.warn("[WorkbenchEventHandler] Could not reopen quest book: {}", e.toString());
        }
    }

    private static void handleConfigReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading configs from: {}", path);

        // `kubejs reload config` — NOT bare `kubejs reload`: on 1.21.1 the
        // command tree is `reload config|startup-scripts|server-scripts`, and
        // a bare `reload` has no executor (s44, verified against the shipped
        // 2101.7.2 jar). This gate is currently frozen app-side
        // (core/sync/config.ts: RELOAD_CONFIG disabled until its evidence
        // shape is probed) — this fix makes the dispatch correct so the gate
        // can unfreeze without a latent dead command.
        sendCommand("kubejs reload config");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleKubeJSReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading KubeJS scripts");

        // Two-command sequence (verified against the shipped KubeJS jar,
        // 2101.7.2-build.368): `kubejs reload` alone has NO executor on 1.21.1 —
        // the tree is `reload config|startup-scripts|server-scripts`. The
        // server-scripts reload re-runs the script files and regenerates
        // KubeJS's virtual data packs, but KubeJS's own command message says
        // recipes/tags/loot tables need the vanilla `/reload` to apply — so we
        // chain it. Both run on the server thread via server.execute(...) FIFO,
        // the same ordering guarantee the quest reopen relies on.
        sendCommand("kubejs reload server-scripts");
        sendCommand("reload");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleCraftTweakerReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading CraftTweaker scripts");

        sendCommand("ct reload");
        // No success toast: unverifiable from the companion (see
        // handleQuestReload) — the app's evidence loop owns the report.
    }

    private static void handleProgressionReload(WorkbenchCompanionClient.WorkbenchEvent event) {
        String path = event.path != null ? event.path : "Unknown path";
        LOGGER.info("[WorkbenchEventHandler] Reloading progression from: {}", path);
        // No command and no toast: progression has no in-game reload path yet —
        // toasting success here would be a claim with no mechanism behind it.
    }

    private static void handleReloadAll(WorkbenchCompanionClient.WorkbenchEvent event) {
        LOGGER.info("[WorkbenchEventHandler] Reloading everything");
        handleQuestReload(event);
        handleConfigReload(event);
        handleKubeJSReload(event);
        handleProgressionReload(event);
        // No blanket success toast — individual handlers are verified by the
        // app's evidence loop as each reload type is un-frozen.
    }

    /**
     * Dispatch a server-side reload command. Preferred path: the integrated
     * server's own command source — a console source has op level 4, so
     * permission gates like FTB's {@code hasEditorPermission} (op 2 or FTB
     * editor permission) pass without the user enabling edit mode (workaround
     * #9 no longer applies to this path). Fallback: the player's connection
     * (multiplayer / no integrated server). Runs on the server thread via
     * {@code server.execute(...)} — never call the dispatcher from the client
     * tick thread.
     */
    private static void sendCommand(String command) {
        Minecraft mc = Minecraft.getInstance();
        MinecraftServer server = mc.getSingleplayerServer();
        if (server != null) {
            server.execute(() ->
                server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), command)
            );
            LOGGER.info("[WorkbenchEventHandler] Dispatched server-side: /{}", command);
            return;
        }
        if (mc.player != null && mc.player.connection != null) {
            mc.player.connection.sendCommand(command);
            LOGGER.info("[WorkbenchEventHandler] Dispatched client-side: /{}", command);
        }
    }
}
