package com.projectgraphite.strata;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class CaptureForwarder {
    private static final String LEGACY_PREFS_NAME = "strata_capture";
    private static final String PREFS_NAME = "strata_capture_secure";
    private static final String KEY_ENDPOINT = "endpoint_url";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_TOKEN_EXPIRES_AT = "token_expires_at";
    private static final String KEY_ALLOWED_CHATS = "allowed_chats";
    private static final String KEY_ENABLED_PACKAGES = "enabled_packages";
    private static final String KEY_OUTBOX = "outbox";
    private static final String KEY_NEEDS_RECONNECT = "needs_reconnect";
    private static final String KEY_EVICTED = "evicted_count";
    private static final String KEY_LAST_ERROR = "last_error";
    private static final String ITEM_PAYLOAD = "payload";
    private static final String ITEM_REJECTED = "rejected";
    private static final int MAX_OUTBOX = 2000;
    private static volatile SharedPreferences securePrefs;

    public static final class FlushResult {
        public int sent;
        public boolean retry;
    }

    private static final class Response {
        final int status;
        final String message;

        Response(int status, String message) {
            this.status = status;
            this.message = message;
        }
    }

    private CaptureForwarder() {}

    public static SharedPreferences prefs(Context context) {
        if (securePrefs == null) {
            synchronized (CaptureForwarder.class) {
                if (securePrefs == null) securePrefs = openSecurePrefs(context.getApplicationContext());
            }
        }
        return securePrefs;
    }

    private static SharedPreferences openSecurePrefs(Context context) {
        try {
            MasterKey key = new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
            SharedPreferences secure = EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
            moveLegacyPrefs(context, secure);
            return secure;
        } catch (GeneralSecurityException | IOException e) {
            throw new IllegalStateException("Could not open the encrypted capture settings", e);
        }
    }

    private static void moveLegacyPrefs(Context context, SharedPreferences secure) {
        Map<String, ?> legacy = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE).getAll();
        if (legacy.isEmpty()) return;
        SharedPreferences.Editor editor = secure.edit();
        for (String key : new String[] { KEY_ENDPOINT, KEY_TOKEN, KEY_ALLOWED_CHATS, KEY_ENABLED_PACKAGES }) {
            Object value = legacy.get(key);
            if (value instanceof String) editor.putString(key, (String) value);
        }
        Object outbox = legacy.get(KEY_OUTBOX);
        if (outbox instanceof String) {
            List<JSONObject> items = new ArrayList<>();
            for (JSONObject payload : objectsOf((String) outbox)) items.add(wrap(payload));
            editor.putString(KEY_OUTBOX, new JSONArray(items).toString());
        }
        editor.commit();
        context.deleteSharedPreferences(LEGACY_PREFS_NAME);
    }

    public static synchronized void saveConfig(
        Context context,
        String endpointUrl,
        String token,
        String tokenExpiresAt,
        List<String> allowedChats,
        List<String> enabledPackages
    ) {
        SharedPreferences.Editor editor = prefs(context).edit();
        editor.putString(KEY_ENDPOINT, endpointUrl.trim());
        if (!token.trim().isEmpty()) {
            editor.putString(KEY_TOKEN, token.trim());
            editor.putString(KEY_TOKEN_EXPIRES_AT, tokenExpiresAt);
            editor.putBoolean(KEY_NEEDS_RECONNECT, false);
        }
        editor.putString(KEY_ALLOWED_CHATS, new JSONArray(allowedChats).toString());
        editor.putString(KEY_ENABLED_PACKAGES, new JSONArray(enabledPackages).toString());
        editor.apply();
    }

    public static String getEndpoint(Context context) {
        return prefs(context).getString(KEY_ENDPOINT, "");
    }

    public static String getTokenExpiresAt(Context context) {
        return prefs(context).getString(KEY_TOKEN_EXPIRES_AT, "");
    }

    public static boolean needsReconnect(Context context) {
        return prefs(context).getBoolean(KEY_NEEDS_RECONNECT, false);
    }

    public static int getEvictedCount(Context context) {
        return prefs(context).getInt(KEY_EVICTED, 0);
    }

    public static String getLastError(Context context) {
        return prefs(context).getString(KEY_LAST_ERROR, "");
    }

    public static boolean isConfigured(Context context) {
        SharedPreferences sp = prefs(context);
        return !sp.getString(KEY_ENDPOINT, "").isEmpty() && !sp.getString(KEY_TOKEN, "").isEmpty();
    }

    private static List<String> getStringList(Context context, String key) {
        try {
            JSONArray array = new JSONArray(prefs(context).getString(key, "[]"));
            List<String> list = new ArrayList<>(array.length());
            for (int i = 0; i < array.length(); i++) {
                String item = array.optString(i, "").trim();
                if (!item.isEmpty()) list.add(item);
            }
            return list;
        } catch (JSONException e) {
            return Collections.emptyList();
        }
    }

    public static List<String> getAllowedChats(Context context) {
        return getStringList(context, KEY_ALLOWED_CHATS);
    }

    public static List<String> getEnabledPackages(Context context) {
        return getStringList(context, KEY_ENABLED_PACKAGES);
    }

    private static String normaliseToken(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s\\-_.]+", "");
    }

    public static boolean isChatAllowed(Context context, String sender) {
        String candidate = normaliseToken(sender);
        if (candidate.isEmpty()) return false;
        for (String allowed : getAllowedChats(context)) {
            if (candidate.equals(normaliseToken(allowed))) return true;
        }
        return false;
    }

    public static boolean isAppEnabled(Context context, String packageName) {
        return FinanceApps.find(packageName) != null && getEnabledPackages(context).contains(packageName);
    }

    public static JSONObject buildPayload(
        String from,
        String text,
        String app,
        String chat,
        long receivedStamp,
        long sentStamp
    ) throws JSONException {
        String sender = from.trim();
        String body = text.trim();
        JSONObject payload = new JSONObject();
        payload.put("from", sender.substring(0, Math.min(60, sender.length())));
        payload.put("text", body.substring(0, Math.min(2000, body.length())));
        payload.put("receivedStamp", String.valueOf(receivedStamp > 0 ? receivedStamp : System.currentTimeMillis()));
        if (sentStamp > 0) payload.put("sentStamp", String.valueOf(sentStamp));
        payload.put("app", app);
        if (!chat.isEmpty()) payload.put("chat", chat.substring(0, Math.min(60, chat.length())));
        return payload;
    }

    private static JSONObject wrap(JSONObject payload) {
        JSONObject item = new JSONObject();
        try {
            item.put(ITEM_PAYLOAD, payload);
        } catch (JSONException e) {
            throw new IllegalArgumentException(e);
        }
        return item;
    }

    private static List<JSONObject> objectsOf(String raw) {
        List<JSONObject> objects = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item != null) objects.add(item);
            }
        } catch (JSONException e) {
            return objects;
        }
        return objects;
    }

    private static List<JSONObject> readOutbox(Context context) {
        return objectsOf(prefs(context).getString(KEY_OUTBOX, "[]"));
    }

    public static synchronized void enqueue(Context context, List<JSONObject> payloads) {
        if (payloads.isEmpty()) return;
        List<JSONObject> items = readOutbox(context);
        for (JSONObject payload : payloads) items.add(wrap(payload));
        int overflow = items.size() - MAX_OUTBOX;
        SharedPreferences.Editor editor = prefs(context).edit();
        if (overflow > 0) {
            items = items.subList(overflow, items.size());
            editor.putInt(KEY_EVICTED, getEvictedCount(context) + overflow);
        }
        editor.putString(KEY_OUTBOX, new JSONArray(items).toString()).commit();
    }

    public static synchronized int[] getOutboxCounts(Context context) {
        int queued = 0;
        int rejected = 0;
        for (JSONObject item : readOutbox(context)) {
            if (item.has(ITEM_REJECTED)) rejected++;
            else queued++;
        }
        return new int[] { queued, rejected };
    }

    public static synchronized void retryRejected(Context context) {
        List<JSONObject> items = readOutbox(context);
        for (JSONObject item : items) item.remove(ITEM_REJECTED);
        prefs(context).edit().putString(KEY_OUTBOX, new JSONArray(items).toString()).putString(KEY_LAST_ERROR, "").commit();
    }

    public static synchronized FlushResult flushOutbox(Context context) {
        FlushResult result = new FlushResult();
        if (!isConfigured(context) || needsReconnect(context)) return result;
        SharedPreferences sp = prefs(context);
        String endpoint = sp.getString(KEY_ENDPOINT, "");
        String token = sp.getString(KEY_TOKEN, "");
        List<JSONObject> remaining = new ArrayList<>();
        String lastError = sp.getString(KEY_LAST_ERROR, "");
        boolean needsReconnect = false;
        boolean stopped = false;
        for (JSONObject item : readOutbox(context)) {
            JSONObject payload = item.optJSONObject(ITEM_PAYLOAD);
            if (payload == null) continue;
            if (stopped || item.has(ITEM_REJECTED)) {
                remaining.add(item);
                continue;
            }
            Response response = postCapture(endpoint, token, payload);
            if (response.status >= 200 && response.status < 300) {
                result.sent++;
                continue;
            }
            remaining.add(item);
            if (response.status == 401 || response.status == 403) {
                needsReconnect = true;
                stopped = true;
            } else if (response.status >= 400 && response.status < 500 && response.status != 408 && response.status != 429) {
                try {
                    item.put(ITEM_REJECTED, response.status);
                } catch (JSONException e) {
                    throw new IllegalStateException(e);
                }
                lastError = response.message;
            } else {
                result.retry = true;
                stopped = true;
            }
        }
        sp.edit()
            .putString(KEY_OUTBOX, new JSONArray(remaining).toString())
            .putBoolean(KEY_NEEDS_RECONNECT, needsReconnect)
            .putString(KEY_LAST_ERROR, lastError)
            .commit();
        return result;
    }

    private static Response postCapture(String endpointUrl, String token, JSONObject payload) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(endpointUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = conn.getResponseCode();
            return new Response(status, status >= 400 ? errorMessage(status, conn.getErrorStream()) : "");
        } catch (IOException e) {
            return new Response(0, "");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String errorMessage(int status, InputStream stream) throws IOException {
        if (stream == null) return "HTTP " + status;
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        try (InputStream in = stream) {
            byte[] buffer = new byte[1024];
            int read;
            while ((read = in.read(buffer)) != -1 && body.size() < 4096) body.write(buffer, 0, read);
        }
        String text = body.toString("UTF-8");
        try {
            Object message = new JSONObject(text).opt("message");
            if (message instanceof JSONArray) return ((JSONArray) message).join("; ").replace("\"", "");
            if (message != null) return message.toString();
        } catch (JSONException e) {
            return "HTTP " + status;
        }
        return "HTTP " + status;
    }
}
