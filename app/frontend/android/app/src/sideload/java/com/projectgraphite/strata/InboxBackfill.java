package com.projectgraphite.strata;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

public final class InboxBackfill {
    public static final boolean AVAILABLE = true;
    private static final long WINDOW_MS = 90L * 24 * 60 * 60 * 1000;
    private static final int REQUEST_CODE = 4107;

    private InboxBackfill() {}

    public static boolean granted(Context context) {
        return context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    public static void requestAccess(Activity activity) {
        activity.requestPermissions(new String[] { Manifest.permission.READ_SMS }, REQUEST_CODE);
    }

    public static int[] run(Context context) throws JSONException {
        List<JSONObject> payloads = new ArrayList<>();
        Set<String> allowedChats = CaptureForwarder.getAllowedChatTokens(context);
        int scanned = 0;
        try (Cursor cursor = context.getContentResolver().query(
            Telephony.Sms.Inbox.CONTENT_URI,
            new String[] { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.DATE_SENT },
            Telephony.Sms.DATE + " >= ?",
            new String[] { String.valueOf(System.currentTimeMillis() - WINDOW_MS) },
            Telephony.Sms.DATE + " ASC"
        )) {
            while (cursor != null && cursor.moveToNext()) {
                scanned++;
                String address = cursor.getString(0);
                String body = cursor.getString(1);
                if (address == null || body == null || body.trim().isEmpty() || !CaptureForwarder.isChatAllowed(allowedChats, address)) continue;
                payloads.add(CaptureForwarder.buildPayload(address, body, "sms", address, cursor.getLong(2), cursor.getLong(3)));
            }
        }
        CaptureForwarder.enqueue(context, payloads);
        CaptureUploadWorker.schedule(context);
        return new int[] { scanned, payloads.size() };
    }
}
