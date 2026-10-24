package com.projectgraphite.strata;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
            "com.oneplus.mms",
            "com.whatsapp",
            "org.telegram.messenger"
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
        processStatusBarNotification(sbn, null, true);
    }

    public static int[] scanActiveNotifications(Context context, List<String> overrideChats) {
        TransactionNotificationService service = instance;
        if (service == null) {
            return new int[] { 0, 0 };
        }
        StatusBarNotification[] active;
        try {
            active = service.getActiveNotifications();
        } catch (Exception e) {
            return new int[] { 0, 0 };
        }
        if (active == null) {
            return new int[] { 0, 0 };
        }
        int scanned = 0;
        int forwarded = 0;
        for (StatusBarNotification sbn : active) {
            scanned++;
            if (service.processStatusBarNotification(sbn, overrideChats, false)) {
                forwarded++;
            }
        }
        return new int[] { scanned, forwarded };
    }

    private boolean processStatusBarNotification(
        StatusBarNotification sbn,
        List<String> overrideChats,
        boolean async
    ) {
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

        String digitalAppLabel = CaptureForwarder.digitalAppLabelForPackage(packageName);
        boolean isDigitalTransactionApp = digitalAppLabel != null && CaptureForwarder.isDigitalAppEnabled(appContext, packageName);
        boolean isMessagingApp = isMessagingPackage(appContext, packageName);

        String sender;
        String chat;
        String fullText;
        String channelApp;

        if (isDigitalTransactionApp) {
            sender = digitalAppLabel;
            chat = title.isEmpty() ? digitalAppLabel : title;
            fullText = (!title.isEmpty() && !title.equalsIgnoreCase(digitalAppLabel) && !body.contains(title))
                ? (title + ": " + body)
                : body;
            channelApp = packageName;
        } else if (isMessagingApp && !title.isEmpty()) {
            List<String> allowedChats = overrideChats != null
                ? overrideChats
                : CaptureForwarder.getAllowedChats(appContext);
            if (!CaptureForwarder.isChatAllowed(appContext, title, allowedChats)) {
                return false;
            }
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
            EXECUTOR.execute(() -> {
                try {
                    JSONObject payload = CaptureForwarder.buildPayload(appContext, sender, fullText, channelApp, chat, postTime);
                    CaptureForwarder.enqueueAndFlush(appContext, payload);
                } catch (Exception ignored) {
                }
            });
            return true;
        } else {
            try {
                JSONObject payload = CaptureForwarder.buildPayload(appContext, sender, fullText, channelApp, chat, postTime);
                return CaptureForwarder.enqueueAndFlush(appContext, payload);
            } catch (Exception e) {
                return false;
            }
        }
    }

    private static String extractMessagingStyleText(Bundle extras) {
        try {
            Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (messages == null || messages.length == 0) return "";
            Parcelable last = messages[messages.length - 1];
            if (last instanceof Bundle) {
                CharSequence text = ((Bundle) last).getCharSequence("text");
                if (text != null) return text.toString().trim();
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private static boolean isMessagingPackage(Context context, String packageName) {
        if (MESSAGING_PACKAGES.contains(packageName)) return true;
        try {
            String defaultSms = Telephony.Sms.getDefaultSmsPackage(context);
            return defaultSms != null && defaultSms.equals(packageName);
        } catch (Exception e) {
            return false;
        }
    }
}
