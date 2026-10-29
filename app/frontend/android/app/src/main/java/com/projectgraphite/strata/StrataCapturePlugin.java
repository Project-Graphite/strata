package com.projectgraphite.strata;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

@CapacitorPlugin(name = "StrataCapture")
public class StrataCapturePlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void configure(PluginCall call) {
        try {
            CaptureForwarder.saveConfig(
                getContext(),
                call.getString("endpointUrl", ""),
                call.getString("token", ""),
                call.getString("tokenExpiresAt", ""),
                toStringList(call.getArray("allowedChats")),
                toStringList(call.getArray("enabledPackages"))
            );
        } catch (JSONException e) {
            call.reject("Could not read the capture settings", e);
            return;
        }
        CaptureUploadWorker.schedule(getContext());
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void scanNotifications(PluginCall call) {
        if (!isNotificationListenerEnabled(getContext())) {
            call.reject("Notification access is not enabled");
            return;
        }
        getBridge().execute(() -> {
            int[] counts = TransactionNotificationService.scanActiveNotifications();
            JSObject result = new JSObject();
            result.put("scanned", counts[0]);
            result.put("forwarded", counts[1]);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void requestSmsAccess(PluginCall call) {
        if (!InboxBackfill.AVAILABLE) {
            call.unavailable("Reading past texts is only in the Strata app from GitHub");
            return;
        }
        InboxBackfill.requestAccess(getActivity());
        call.resolve();
    }

    @PluginMethod
    public void backfillInbox(PluginCall call) {
        Context context = getContext();
        if (!InboxBackfill.AVAILABLE) {
            call.unavailable("Reading past texts is only in the Strata app from GitHub");
            return;
        }
        if (!InboxBackfill.granted(context)) {
            call.reject("Allow Strata to read your texts first");
            return;
        }
        getBridge().execute(() -> {
            try {
                int[] counts = InboxBackfill.run(context);
                JSObject result = new JSObject();
                result.put("scanned", counts[0]);
                result.put("queued", counts[1]);
                call.resolve(result);
            } catch (JSONException e) {
                call.reject("Could not read past texts", e);
            }
        });
    }

    @PluginMethod
    public void flushOutbox(PluginCall call) {
        getBridge().execute(() -> {
            Context context = getContext();
            CaptureForwarder.FlushResult flushed = CaptureForwarder.flushOutbox(context);
            if (flushed.retry) CaptureUploadWorker.schedule(context);
            JSObject result = new JSObject();
            result.put("sent", flushed.sent);
            result.put("remaining", CaptureForwarder.getOutboxCounts(context)[0]);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void retryRejected(PluginCall call) {
        CaptureForwarder.retryRejected(getContext());
        CaptureUploadWorker.schedule(getContext());
        call.resolve(buildStatusObject());
    }

    private JSObject buildStatusObject() {
        Context context = getContext();
        int[] outbox = CaptureForwarder.getOutboxCounts(context);
        JSArray installedApps = new JSArray();
        for (FinanceApps.App app : FinanceApps.installed(context)) {
            JSObject entry = new JSObject();
            entry.put("packageName", app.packageName);
            entry.put("label", app.label);
            entry.put("group", app.group);
            installedApps.put(entry);
        }
        JSObject status = new JSObject();
        status.put("notificationsGranted", isNotificationListenerEnabled(context));
        status.put("smsBackfillAvailable", InboxBackfill.AVAILABLE);
        status.put("smsGranted", InboxBackfill.granted(context));
        status.put("configured", CaptureForwarder.isConfigured(context));
        status.put("needsReconnect", CaptureForwarder.needsReconnect(context));
        status.put("endpointUrl", CaptureForwarder.getEndpoint(context));
        status.put("tokenExpiresAt", CaptureForwarder.getTokenExpiresAt(context));
        status.put("allowedChats", new JSArray(CaptureForwarder.getAllowedChats(context)));
        status.put("enabledPackages", new JSArray(CaptureForwarder.getEnabledPackages(context)));
        status.put("installedApps", installedApps);
        status.put("queuedCount", outbox[0]);
        status.put("rejectedCount", outbox[1]);
        status.put("evictedCount", CaptureForwarder.getEvictedCount(context));
        status.put("lastError", CaptureForwarder.getLastError(context));
        return status;
    }

    private static boolean isNotificationListenerEnabled(Context context) {
        String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return false;
        ComponentName cn = new ComponentName(context, TransactionNotificationService.class);
        return flat.contains(cn.flattenToString()) || flat.contains(cn.flattenToShortString());
    }

    private static List<String> toStringList(JSArray array) throws JSONException {
        List<String> list = new ArrayList<>();
        if (array == null) return list;
        for (Object item : array.toList()) {
            String value = String.valueOf(item).trim();
            if (!value.isEmpty()) list.add(value);
        }
        return list;
    }
}
