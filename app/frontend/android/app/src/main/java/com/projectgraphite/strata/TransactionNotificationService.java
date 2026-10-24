package com.projectgraphite.strata;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
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
    private static final Set<String> MESSAGING_PACKAGES = new HashSet<>(
        Arrays.asList(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
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
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.isOngoing()) return;
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return;
        }

        final Context appContext = getApplicationContext();
        if (!CaptureForwarder.isConfigured(appContext)) return;

        String packageName = sbn.getPackageName();
        if (packageName == null || packageName.equals(appContext.getPackageName())) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

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
        if (body.isEmpty()) return;

        String digitalAppLabel = CaptureForwarder.digitalAppLabelForPackage(packageName);
        boolean isDigitalTransactionApp = digitalAppLabel != null && CaptureForwarder.isDigitalAppEnabled(appContext, packageName);
        boolean isMessagingApp = isMessagingPackage(appContext, packageName);

        String sender;
        String chat;
        String fullText;

        if (isDigitalTransactionApp) {
            sender = digitalAppLabel;
            chat = title.isEmpty() ? digitalAppLabel : title;
            fullText = (!title.isEmpty() && !title.equalsIgnoreCase(digitalAppLabel) && !body.contains(title))
                ? (title + ": " + body)
                : body;
        } else if (isMessagingApp && !title.isEmpty()) {
            List<String> allowedChats = CaptureForwarder.getAllowedChats(appContext);
            if (allowedChats.isEmpty() || !CaptureForwarder.isChatAllowed(appContext, title, allowedChats)) {
                return;
            }
            sender = title;
            chat = title;
            fullText = body;
        } else {
            return;
        }

        long now = System.currentTimeMillis();
        String signature = packageName + "|" + sender + "|" + fullText;
        synchronized (recentSignatures) {
            Long previous = recentSignatures.get(signature);
            if (previous != null && (now - previous) < DEDUPE_WINDOW_MS) {
                return;
            }
            recentSignatures.put(signature, now);
        }

        final long postTime = sbn.getPostTime() > 0 ? sbn.getPostTime() : now;
        EXECUTOR.execute(() -> {
            try {
                JSONObject payload = CaptureForwarder.buildPayload(appContext, sender, fullText, packageName, chat, postTime);
                CaptureForwarder.enqueueAndFlush(appContext, payload);
            } catch (Exception ignored) {
            }
        });
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

