package com.projectgraphite.strata;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Settings;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "StrataCapture",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS },
            alias = "sms"
        )
    }
)
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
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionsCallback");
    }

    @PermissionCallback
    private void smsPermissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(ret);
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
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission is not granted");
            return;
        }
        Context context = getContext();
        List<String> overrideChats = call.getArray("allowedChats") != null
            ? toStringList(call.getArray("allowedChats"))
            : CaptureForwarder.getAllowedChats(context);
        int limit = Math.min(500, Math.max(1, call.getInt("limit", 100)));
        long sinceStamp = call.getLong("sinceStamp", 0L);

        getBridge().execute(() -> {
            int scanned = 0;
            int forwarded = 0;
            Uri inboxUri = Telephony.Sms.Inbox.CONTENT_URI;
            String[] projection = new String[] {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            };
            String selection = sinceStamp > 0 ? (Telephony.Sms.DATE + " >= ?") : null;
            String[] selectionArgs = sinceStamp > 0 ? new String[] { String.valueOf(sinceStamp) } : null;

            try (Cursor cursor = context.getContentResolver().query(
                inboxUri,
                projection,
                selection,
                selectionArgs,
                Telephony.Sms.DATE + " DESC"
            )) {
                if (cursor != null) {
                    int addrIdx = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
                    int bodyIdx = cursor.getColumnIndex(Telephony.Sms.BODY);
                    int dateIdx = cursor.getColumnIndex(Telephony.Sms.DATE);

                    while (cursor.moveToNext() && scanned < limit) {
                        scanned++;
                        String sender = addrIdx >= 0 ? cursor.getString(addrIdx) : null;
                        String body = bodyIdx >= 0 ? cursor.getString(bodyIdx) : null;
                        long date = dateIdx >= 0 ? cursor.getLong(dateIdx) : System.currentTimeMillis();
                        if (sender == null || body == null || body.trim().isEmpty()) continue;
                        if (!CaptureForwarder.isChatAllowed(context, sender, overrideChats)) continue;

                        JSONObject payload = CaptureForwarder.buildPayload(context, sender, body, "sms", sender, date);
                        if (CaptureForwarder.enqueueAndFlush(context, payload)) {
                            forwarded++;
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("scanned", scanned);
                result.put("forwarded", forwarded);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not read SMS inbox", e);
            }
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
        JSObject status = new JSObject();
        status.put("smsGranted", getPermissionState("sms") == PermissionState.GRANTED);
        status.put("notificationsGranted", isNotificationListenerEnabled(context));
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

