package com.modcanvas.companion.client;

import com.google.gson.JsonObject;

public class HotSwapEvent {
    public final String eventType;
    public final long timestamp;
    public final String path;
    public final JsonObject payload;
    
    public HotSwapEvent(String eventType, long timestamp, String path, JsonObject payload) {
        this.eventType = eventType;
        this.timestamp = timestamp;
        this.path = path;
        this.payload = payload;
    }
    
    @Override
    public String toString() {
        return "HotSwapEvent{type='" + eventType + "', path='" + path + "', timestamp=" + timestamp + "}";
    }
}