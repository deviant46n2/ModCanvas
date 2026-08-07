package com.modcanvas.companion.client;

import com.google.gson.JsonObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Renders engine-requested item icons a few per client tick so a large batch
 * never freezes a frame. Results accumulate and are sent as a single
 * {@code RENDER_ITEMS_RESULT} when the batch drains.
 *
 * <p>Failed renders are re-queued (front of the queue) instead of dropped:
 * the quest editor's pipeline fires on mount, well before the game's model
 * reload completes, so early renders throw on un-baked models. Retrying lets
 * the batch self-heal once models are ready; an attempt cap keeps a
 * permanently-bad id from wedging the queue.
 */
public final class ItemRenderQueue {
    /** Items rendered per client tick — a small batch keeps the frame hitch
     *  bounded while still draining large queues quickly. */
    private static final int PER_TICK = 16;

    /** Retries per item before giving up (transient early-load failures clear
     *  within a couple of ticks once models bake). */
    private static final int MAX_ATTEMPTS = 3;

    private static final Deque<String> queue = new ArrayDeque<>();
    private static final JsonObject results = new JsonObject();
    private static final Map<String, Integer> attempts = new HashMap<>();
    private static String requestId = null;
    private static int size = ItemIconRenderer.DEFAULT_SIZE;

    private ItemRenderQueue() {}

    public static synchronized void enqueue(List<String> items, String id, int renderSize) {
        if (requestId == null) {
            requestId = id;
        }
        if (renderSize >= 16) {
            size = renderSize;
        }
        for (String item : items) {
            queue.addLast(item);
        }
    }

    public static synchronized boolean isBusy() {
        return requestId != null;
    }

    /** Render up to PER_TICK queued items; flush the result when drained. */
    public static synchronized void tick() {
        if (requestId == null) {
            return;
        }

        List<String> batch = new ArrayList<>(PER_TICK);
        while (!queue.isEmpty() && batch.size() < PER_TICK) {
            batch.add(queue.pollFirst());
        }
        if (batch.isEmpty()) {
            return;
        }

        JsonObject rendered = ItemIconRenderer.render(batch, size);
        rendered.entrySet().forEach(e -> results.add(e.getKey(), e.getValue()));

        for (String id : batch) {
            if (rendered.has(id)) {
                attempts.remove(id);
                continue;
            }
            int n = attempts.getOrDefault(id, 0) + 1;
            if (n >= MAX_ATTEMPTS) {
                attempts.remove(id);
            } else {
                attempts.put(id, n);
                queue.addFirst(id);
            }
        }

        if (queue.isEmpty()) {
            JsonObject reply = new JsonObject();
            reply.addProperty("requestId", requestId);
            reply.add("rendered", results);
            WorkbenchCompanionClient.sendEvent("RENDER_ITEMS_RESULT", reply);
            results.entrySet().clear();
            requestId = null;
            attempts.clear();
        }
    }
}
