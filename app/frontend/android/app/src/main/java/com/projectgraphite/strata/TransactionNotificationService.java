package com.projectgraphite.strata;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.os.Parcelable;
import android.os.SystemClock;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.lang.ref.WeakReference;
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
    private static final long DEDUPE_WINDOW_MS = 60_000L;
    private static final long DEFAULT_SMS_REFRESH_MS = 60_000L;
    private static volatile WeakReference<TransactionNotificationService> connected = new WeakReference<>(null);
    private static final Set<String> MESSAGING_PACKAGES = new HashSet<>(
        Arrays.asList(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.miui.mms",
            "com.oneplus.mms"
        )
    );

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile String defaultSmsPackage;
    private volatile long defaultSmsCheckedAt;

    private final Map<String, Long> recentSignatures = new LinkedHashMap<String, Long>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
            return size() > 100;
        }
    };

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        connected = new WeakReference<>(this);
    }

    @Override
    public void onListenerDisconnected() {
        if (connected.get() == this) {
            connected = new WeakReference<>(null);
        }
        super.onListenerDisconnected();
    }

    @Override
    public void onDestroy() {
        executor.shutdown();
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !mayCapture(sbn.getPackageName())) return;
        executor.execute(() -> capture(sbn));
    }

    public static int[] scanActiveNotifications() {
        TransactionNotificationService service = connected.get();
        if (service == null) {
            return new int[] { 0, 0 };
        }
        StatusBarNotification[] active = service.getActiveNotifications();
        if (active == null) {
            return new int[] { 0, 0 };
        }
        int forwarded = 0;
        for (StatusBarNotification sbn : active) {
            if (service.mayCapture(sbn.getPackageName()) && service.capture(sbn)) {
                forwarded++;
            }
        }
        return new int[] { active.length, forwarded };
    }

    private boolean mayCapture(String packageName) {
        return FinanceApps.find(packageName) != null || isMessagingPackage(packageName);
    }

    private boolean isMessagingPackage(String packageName) {
        if (MESSAGING_PACKAGES.contains(packageName)) return true;
        long now = SystemClock.elapsedRealtime();
        if (defaultSmsCheckedAt == 0 || now - defaultSmsCheckedAt > DEFAULT_SMS_REFRESH_MS) {
            defaultSmsPackage = Telephony.Sms.getDefaultSmsPackage(this);
            defaultSmsCheckedAt = now;
        }
        return packageName != null && packageName.equals(defaultSmsPackage);
    }

    private boolean capture(StatusBarNotification sbn) {
        if (sbn.isOngoing()) return false;
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return false;
        }

        final Context appContext = getApplicationContext();
        if (!CaptureForwarder.isConfigured(appContext)) return false;

        String packageName = sbn.getPackageName();

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
        } else if (isMessagingPackage(packageName) && CaptureForwarder.isChatAllowed(appContext, title)) {
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

        return queue(appContext, sender, fullText, channelApp, chat, sbn.getPostTime() > 0 ? sbn.getPostTime() : now);
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
}
