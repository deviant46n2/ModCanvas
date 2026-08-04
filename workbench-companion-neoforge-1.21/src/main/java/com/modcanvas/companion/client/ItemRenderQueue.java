package com.modcanvas.companion.client;

import com.google.gson.JsonObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Renders engine-requested item icons a few per client tick so a large batch
 * never freezes a frame. Results accumulate and are sent as a single
 * {@code RENDER_ITEMS_RESULT} when the batch drains.
 */
public final class ItemRenderQueue {
    /** Items rendered per client tick — keeps each frame's hitch tiny. */
    private static final int PER_TICK = 4;

    private static final Deque<String> queue = new ArrayDeque<>();
    private static final JsonObject results = new JsonObject();
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

        if (queue.isEmpty()) {
            JsonObject reply = new JsonObject();
            reply.addProperty("requestId", requestId);
            reply.add("rendered", results);
            WorkbenchCompanionClient.sendEvent("RENDER_ITEMS_RESULT", reply);
            results.entrySet().clear();
            requestId = null;
        }
    }
}
