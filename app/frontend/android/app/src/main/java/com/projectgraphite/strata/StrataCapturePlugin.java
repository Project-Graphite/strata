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
        String endpointUrl = call.getString("endpointUrl", "");
        String token = call.getString("token", "");
        List<String> allowedChats = toStringList(call.getArray("allowedChats"));
        List<String> enabledApps = toStringList(call.getArray("enabledApps"));
        List<String> enabledPackages = toStringList(call.getArray("enabledPackages"));

        CaptureForwarder.saveConfig(getContext(), endpointUrl, token, allowedChats, enabledApps, enabledPackages);
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        Context context = getContext();
        if (isNotificationListenerEnabled(context)) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("granted", isNotificationListenerEnabled(context));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open notification listener settings", e);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification listener settings", e);
        }
    }

    @PluginMethod
    public void syncInboxSms(PluginCall call) {
        Context context = getContext();
        if (!isNotificationListenerEnabled(context)) {
            call.reject("Notification access is not enabled");
            return;
        }
        List<String> overrideChats = call.getArray("allowedChats") != null
            ? toStringList(call.getArray("allowedChats"))
            : CaptureForwarder.getAllowedChats(context);

        getBridge().execute(() -> {
            int[] counts = TransactionNotificationService.scanActiveNotifications(context, overrideChats);
            JSObject result = new JSObject();
            result.put("scanned", counts[0]);
            result.put("forwarded", counts[1]);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void flushOutbox(PluginCall call) {
        getBridge().execute(() -> {
            int sent = CaptureForwarder.flushOutbox(getContext());
            int remaining = CaptureForwarder.getOutboxCount(getContext());
            JSObject result = new JSObject();
            result.put("sent", sent);
            result.put("remaining", remaining);
            call.resolve(result);
        });
    }

    private JSObject buildStatusObject() {
        Context context = getContext();
        boolean notificationEnabled = isNotificationListenerEnabled(context);
        JSObject status = new JSObject();
        status.put("smsGranted", notificationEnabled);
        status.put("notificationsGranted", notificationEnabled);
        status.put("configured", CaptureForwarder.isConfigured(context));
        status.put("allowedChats", new JSArray(CaptureForwarder.getAllowedChats(context)));
        status.put("enabledApps", new JSArray(CaptureForwarder.getEnabledApps(context)));
        status.put("queuedCount", CaptureForwarder.getOutboxCount(context));
        return status;
    }

    private static boolean isNotificationListenerEnabled(Context context) {
        String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return false;
        ComponentName cn = new ComponentName(context, TransactionNotificationService.class);
        String flatName = cn.flattenToString();
        String shortName = cn.flattenToShortString();
        return flat.contains(flatName) || flat.contains(shortName);
    }

    private static List<String> toStringList(JSArray array) {
        List<String> list = new ArrayList<>();
        if (array == null) return list;
        try {
            List<Object> raw = array.toList();
            for (Object item : raw) {
                if (item != null) {
                    String s = String.valueOf(item).trim();
                    if (!s.isEmpty()) list.add(s);
                }
            }
        } catch (JSONException ignored) {
        }
        return list;
    }
}
