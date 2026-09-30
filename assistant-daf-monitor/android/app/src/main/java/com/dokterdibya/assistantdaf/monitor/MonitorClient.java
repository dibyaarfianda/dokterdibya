package com.dokterdibya.assistantdaf.monitor;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class MonitorClient {
    private static final String BASE = "https://dokterdibya.com/api/assistant-daf/monitor/device";
    private static final int JOB_ID = 471108;
    private static final Object QUEUE_LOCK = new Object();
    private final Context context;
    private final SecureStore store;

    MonitorClient(Context context) {
        this.context = context.getApplicationContext();
        this.store = new SecureStore(this.context);
    }

    private JSONObject post(String path, JSONObject body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 10000) throw new IllegalArgumentException("Payload too long");
        try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
        int status = connection.getResponseCode();
        InputStream input = status < 400 ? connection.getInputStream() : connection.getErrorStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (input != null) {
            try (InputStream in = input) {
                byte[] buffer = new byte[1024]; int count;
                while ((count = in.read(buffer)) > 0) {
                    if (out.size() + count > 10000) throw new IllegalStateException("Response too long");
                    out.write(buffer, 0, count);
                }
            }
        }
        connection.disconnect();
        if (status != 200) throw new IllegalStateException("Server response " + status);
        return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
    }

    boolean isPaired() {
        try { return token() != null; } catch (Exception ignored) { return false; }
    }

    private String token() throws Exception { return store.get("token"); }

    void pair(String code) throws Exception {
        JSONObject body = new JSONObject();
        body.put("code", code.trim());
        body.put("label", "Android " + Build.MODEL);
        JSONObject response = post("/claim", body, null);
        String received = response.getString("token");
        if (!received.matches("[A-Za-z0-9_-]{43}")) throw new IllegalStateException("Invalid pairing token");
        store.put("token", received);
        schedule(context);
    }

    void heartbeat() throws Exception {
        String credential = token();
        if (credential != null) post("/heartbeat", new JSONObject(), credential);
    }

    void process(String chatKey, String label, String text, long messageTime, boolean truncated) throws Exception {
        String credential = token();
        if (credential == null) return;
        JSONObject identity = new JSONObject().put("chat_key", chatKey).put("label", label);
        post("/discover", identity, credential);
        // The body of an unselected chat never leaves this device.
        JSONObject allowed = post("/allowed", new JSONObject().put("chat_key", chatKey), credential);
        if (!allowed.optBoolean("allowed")) return;
        JSONObject event = new JSONObject();
        event.put("chat_key", chatKey);
        event.put("event_id", eventId(chatKey, text, messageTime));
        event.put("text", text);
        event.put("truncated", truncated);
        try { post("/event", event, credential); }
        catch (Exception error) { enqueue(event); throw error; }
    }

    private String eventId(String chat, String text, long time) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest((chat + "\n" + time + "\n" + text).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte item : digest) hex.append(String.format("%02x", item & 0xff));
        return hex.toString();
    }

    private void enqueue(JSONObject item) throws Exception {
        synchronized (QUEUE_LOCK) {
            String stored = store.get("queue");
            JSONArray queue = stored == null ? new JSONArray() : new JSONArray(stored);
            if (queue.length() >= 100) queue.remove(0);
            queue.put(item);
            store.put("queue", queue.toString());
        }
    }

    void flush() throws Exception {
        String credential = token();
        if (credential == null) return;
        heartbeat();
        synchronized (QUEUE_LOCK) {
            String stored = store.get("queue");
            JSONArray queue = stored == null ? new JSONArray() : new JSONArray(stored);
            JSONArray remaining = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                try {
                    JSONObject allowed = post("/allowed", new JSONObject().put("chat_key", item.getString("chat_key")), credential);
                    if (allowed.optBoolean("allowed")) post("/event", item, credential);
                } catch (Exception error) { remaining.put(item); }
            }
            store.put("queue", remaining.toString());
        }
    }

    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, MonitorJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true).build();
        scheduler.schedule(job);
    }
}
