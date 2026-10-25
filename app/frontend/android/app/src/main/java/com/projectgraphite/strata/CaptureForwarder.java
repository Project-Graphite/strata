package com.projectgraphite.strata;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class CaptureForwarder {
    private static final String PREFS_NAME = "strata_capture";
    private static final String KEY_ENDPOINT = "endpoint_url";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_ALLOWED_CHATS = "allowed_chats";
    private static final String KEY_ENABLED_APPS = "enabled_apps";
    private static final String KEY_ENABLED_PACKAGES = "enabled_packages";
    private static final String KEY_OUTBOX = "outbox";
    private static final int MAX_OUTBOX = 200;

    private CaptureForwarder() {}

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized void saveConfig(
        Context context,
        String endpointUrl,
        String token,
        List<String> allowedChats,
        List<String> enabledApps,
        List<String> enabledPackages
    ) {
        SharedPreferences.Editor editor = prefs(context).edit();
        editor.putString(KEY_ENDPOINT, endpointUrl != null ? endpointUrl.trim() : "");
        if (token != null && !token.trim().isEmpty()) {
            editor.putString(KEY_TOKEN, token.trim());
        }
        editor.putString(KEY_ALLOWED_CHATS, new JSONArray(allowedChats).toString());
        editor.putString(KEY_ENABLED_APPS, new JSONArray(enabledApps).toString());
        editor.putString(KEY_ENABLED_PACKAGES, new JSONArray(enabledPackages).toString());
        editor.apply();
    }

    public static String getEndpoint(Context context) {
        String endpoint = prefs(context).getString(KEY_ENDPOINT, "");
        return endpoint != null ? endpoint : "";
    }

    public static boolean isConfigured(Context context) {
        SharedPreferences sp = prefs(context);
        String endpoint = sp.getString(KEY_ENDPOINT, "");
        String token = sp.getString(KEY_TOKEN, "");
        return endpoint != null && !endpoint.isEmpty() && token != null && !token.isEmpty();
    }

    public static List<String> getStringList(Context context, String key, List<String> fallback) {
        String raw = prefs(context).getString(key, null);
        if (raw == null || raw.isEmpty()) return fallback;
        try {
            JSONArray array = new JSONArray(raw);
            List<String> list = new ArrayList<>(array.length());
            for (int i = 0; i < array.length(); i++) {
                String item = array.optString(i, "").trim();
                if (!item.isEmpty()) list.add(item);
            }
            return list;
        } catch (JSONException e) {
            return fallback;
        }
    }

    public static List<String> getAllowedChats(Context context) {
        return getStringList(context, KEY_ALLOWED_CHATS, Collections.emptyList());
    }

    public static List<String> getEnabledApps(Context context) {
        List<String> defaults = new ArrayList<>();
        defaults.add("instapay");
        defaults.add("nsave");
        defaults.add("paypal");
        return getStringList(context, KEY_ENABLED_APPS, defaults);
    }

    public static List<String> getEnabledPackages(Context context) {
        List<String> defaults = new ArrayList<>();
        defaults.add("com.egyptianbanks.instapay");
        defaults.add("com.nsave.app");
        defaults.add("tech.nsave.app");
        defaults.add("com.paypal.android.p2pmobile");
        return getStringList(context, KEY_ENABLED_PACKAGES, defaults);
    }

    public static String normaliseToken(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s\\-_.]+", "");
    }

    public static boolean isChatAllowed(Context context, String senderOrChat, List<String> overrideChats) {
        List<String> allowed = overrideChats != null ? overrideChats : getAllowedChats(context);
        if (allowed.isEmpty()) return true;
        String candidate = normaliseToken(senderOrChat);
        if (candidate.isEmpty()) return false;
        for (String filter : allowed) {
            String cleanFilter = normaliseToken(filter);
            if (!cleanFilter.isEmpty() && (candidate.equals(cleanFilter) || candidate.contains(cleanFilter) || cleanFilter.contains(candidate))) {
                return true;
            }
        }
        return false;
    }

    public static String digitalAppLabelForPackage(String packageName) {
        if (packageName == null) return null;
        String pkg = packageName.toLowerCase(Locale.ROOT);
        if (pkg.contains("instapay")) return "InstaPay";
        if (pkg.contains("nsave")) return "nSave";
        if (pkg.contains("paypal")) return "PayPal";
        return null;
    }

    public static boolean isDigitalAppEnabled(Context context, String packageName) {
        if (packageName == null) return false;
        Set<String> enabled = new HashSet<>(getEnabledPackages(context));
        return enabled.contains(packageName);
    }

    public static synchronized int getOutboxCount(Context context) {
        String raw = prefs(context).getString(KEY_OUTBOX, "[]");
        try {
            return new JSONArray(raw).length();
        } catch (JSONException e) {
            return 0;
        }
    }

    public static JSONObject buildPayload(
        Context context,
        String from,
        String text,
        String app,
        String chat,
        long receivedStamp
    ) throws JSONException {
        JSONObject payload = new JSONObject();
        payload.put("from", from != null && !from.trim().isEmpty() ? from.trim().substring(0, Math.min(60, from.trim().length())) : "Unknown");
        payload.put("text", text != null ? text.trim().substring(0, Math.min(2000, text.trim().length())) : "");
        payload.put("receivedStamp", String.valueOf(receivedStamp > 0 ? receivedStamp : System.currentTimeMillis()));
        if (app != null && !app.isEmpty()) payload.put("app", app);
        if (chat != null && !chat.isEmpty()) payload.put("chat", chat.substring(0, Math.min(60, chat.length())));

        List<String> allowed = new ArrayList<>(getAllowedChats(context));
        for (String appId : getEnabledApps(context)) {
            if ("instapay".equalsIgnoreCase(appId)) allowed.add("InstaPay");
            else if ("nsave".equalsIgnoreCase(appId)) allowed.add("nSave");
            else if ("paypal".equalsIgnoreCase(appId)) allowed.add("PayPal");
        }
        if (!getAllowedChats(context).isEmpty()) {
            payload.put("allowedChats", new JSONArray(allowed));
        }
        return payload;
    }

    public static boolean enqueueAndFlush(Context context, JSONObject payload) {
        if (!isConfigured(context)) return false;
        enqueue(context, payload);
        return flushOutbox(context) > 0;
    }

    private static synchronized void enqueue(Context context, JSONObject payload) {
        SharedPreferences sp = prefs(context);
        JSONArray queue;
        try {
            queue = new JSONArray(sp.getString(KEY_OUTBOX, "[]"));
        } catch (JSONException e) {
            queue = new JSONArray();
        }
        JSONArray next = new JSONArray();
        int start = Math.max(0, queue.length() - (MAX_OUTBOX - 1));
        for (int i = start; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null) next.put(item);
        }
        next.put(payload);
        sp.edit().putString(KEY_OUTBOX, next.toString()).apply();
    }

    public static synchronized int flushOutbox(Context context) {
        if (!isConfigured(context)) return 0;
        SharedPreferences sp = prefs(context);
        String endpoint = sp.getString(KEY_ENDPOINT, "");
        String token = sp.getString(KEY_TOKEN, "");
        JSONArray queue;
        try {
            queue = new JSONArray(sp.getString(KEY_OUTBOX, "[]"));
        } catch (JSONException e) {
            return 0;
        }
        if (queue.length() == 0) return 0;

        JSONArray remaining = new JSONArray();
        int sentCount = 0;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject payload = queue.optJSONObject(i);
            if (payload == null) continue;
            if (postCapture(endpoint, token, payload)) {
                sentCount++;
            } else {
                remaining.put(payload);
            }
        }
        sp.edit().putString(KEY_OUTBOX, remaining.toString()).apply();
        return sentCount;
    }

    private static boolean postCapture(String endpointUrl, String token, JSONObject payload) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(endpointUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }
            int status = conn.getResponseCode();
            return (status >= 200 && status < 300) || (status >= 400 && status < 500 && status != 429);
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
