package com.projectgraphite.strata;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

public class TransactionNotificationService extends NotificationListenerService {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final long DEDUPE_WINDOW_MS = 60_000L;
    private static volatile TransactionNotificationService instance;
    private static final Set<String> MESSAGING_PACKAGES = new HashSet<>(
        Arrays.asList(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.miui.mms",
            "com.oneplus.mms"
        )
    );

    private final Map<String, Long> recentSignatures = new LinkedHashMap<String, Long>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
            return size() > 100;
        }
    };

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
    }

    @Override
    public void onListenerDisconnected() {
        if (instance == this) {
            instance = null;
        }
        super.onListenerDisconnected();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        processStatusBarNotification(sbn, true);
    }

    public static int[] scanActiveNotifications() {
        TransactionNotificationService service = instance;
        if (service == null) {
            return new int[] { 0, 0 };
        }
        StatusBarNotification[] active = service.getActiveNotifications();
        if (active == null) {
            return new int[] { 0, 0 };
        }
        int forwarded = 0;
        for (StatusBarNotification sbn : active) {
            if (service.processStatusBarNotification(sbn, false)) {
                forwarded++;
            }
        }
        return new int[] { active.length, forwarded };
    }

    private boolean processStatusBarNotification(StatusBarNotification sbn, boolean async) {
        if (sbn == null || sbn.isOngoing()) return false;
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return false;
        }

        final Context appContext = getApplicationContext();
        if (!CaptureForwarder.isConfigured(appContext)) return false;

        String packageName = sbn.getPackageName();
        if (packageName == null || packageName.equals(appContext.getPackageName())) return false;

        Bundle extras = notification.extras;
        if (extras == null) return false;

        CharSequence titleSeq = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        if (titleSeq == null || titleSeq.length() == 0) {
            titleSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
        }
        CharSequence bigTextSeq = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence textSeq = bigTextSeq != null && bigTextSeq.length() > 0
            ? bigTextSeq
            : extras.getCharSequence(Notification.EXTRA_TEXT);

        String title = titleSeq != null ? titleSeq.toString().trim() : "";
        String body = textSeq != null ? textSeq.toString().trim() : "";
        if (body.isEmpty()) {
            body = extractMessagingStyleText(extras);
        }
        if (body.isEmpty()) return false;

        FinanceApps.App financeApp = FinanceApps.find(packageName);

        final String sender;
        final String chat;
        final String fullText;
        final String channelApp;

        if (financeApp != null && CaptureForwarder.isAppEnabled(appContext, packageName)) {
            sender = financeApp.label;
            chat = title.isEmpty() ? financeApp.label : title;
            fullText = (!title.isEmpty() && !title.equalsIgnoreCase(financeApp.label) && !body.contains(title))
                ? (title + ": " + body)
                : body;
            channelApp = packageName;
        } else if (isMessagingPackage(appContext, packageName) && CaptureForwarder.isChatAllowed(appContext, title)) {
            sender = title;
            chat = title;
            fullText = body;
            channelApp = "sms";
        } else {
            return false;
        }

        long now = System.currentTimeMillis();
        String signature = packageName + "|" + sender + "|" + fullText;
        synchronized (recentSignatures) {
            Long previous = recentSignatures.get(signature);
            if (previous != null && (now - previous) < DEDUPE_WINDOW_MS) {
                return false;
            }
            recentSignatures.put(signature, now);
        }

        final long postTime = sbn.getPostTime() > 0 ? sbn.getPostTime() : now;
        if (async) {
            EXECUTOR.execute(() -> queue(appContext, sender, fullText, channelApp, chat, postTime));
            return true;
        }
        return queue(appContext, sender, fullText, channelApp, chat, postTime);
    }

    private static boolean queue(Context context, String sender, String text, String app, String chat, long postTime) {
        try {
            JSONObject payload = CaptureForwarder.buildPayload(sender, text, app, chat, postTime, 0);
            CaptureForwarder.enqueue(context, Collections.singletonList(payload));
        } catch (JSONException e) {
            return false;
        }
        CaptureUploadWorker.schedule(context);
        return true;
    }

    private static String extractMessagingStyleText(Bundle extras) {
        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages == null || messages.length == 0) return "";
        Parcelable last = messages[messages.length - 1];
        if (last instanceof Bundle) {
            CharSequence text = ((Bundle) last).getCharSequence("text");
            if (text != null) return text.toString().trim();
        }
        return "";
    }

    private static boolean isMessagingPackage(Context context, String packageName) {
        if (MESSAGING_PACKAGES.contains(packageName)) return true;
        String defaultSms = Telephony.Sms.getDefaultSmsPackage(context);
        return defaultSms != null && defaultSms.equals(packageName);
    }
}
