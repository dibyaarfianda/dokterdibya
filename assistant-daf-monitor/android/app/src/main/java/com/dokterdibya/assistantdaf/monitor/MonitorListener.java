package com.dokterdibya.assistantdaf.monitor;

import android.app.Notification;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MonitorListener extends NotificationListenerService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override public void onListenerConnected() {
        super.onListenerConnected();
        MonitorClient.schedule(this);
        worker.execute(() -> {
            try { new MonitorClient(this).flush(); } catch (Exception ignored) { /* Retried by periodic job. */ }
        });
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        if (!"com.whatsapp.w4b".equals(sbn.getPackageName())) return;
        Notification notification = sbn.getNotification();
        String chatKey = notification.getShortcutId();
        // WhatsApp's visible title is not a stable identity. Unknown IDs are dropped.
        if (chatKey == null || !chatKey.matches("[A-Za-z0-9_:./@+\\-]{8,256}")) return;
        CharSequence heading = notification.extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        if (heading == null) heading = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        if (heading == null) return;
        String label = heading.toString().trim();
        if (label.isEmpty() || label.length() > 100) return;
        String text = null;
        long time = sbn.getPostTime();
        boolean truncated = true;
        Parcelable[] bundles = notification.extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (bundles != null) {
            List<Notification.MessagingStyle.Message> messages =
                    Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles);
            if (messages != null && !messages.isEmpty()) {
                Notification.MessagingStyle.Message last = messages.get(messages.size() - 1);
                if (last.getText() != null) {
                    text = last.getText().toString();
                    time = last.getTimestamp();
                    truncated = false;
                }
            }
        }
        if (text == null) {
            CharSequence preview = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
            if (preview != null) text = preview.toString();
        }
        if (text == null || text.trim().isEmpty() || text.length() > 2000) return;
        String captured = text.trim();
        long capturedTime = time;
        boolean possiblyTruncated = truncated || captured.endsWith("…") || captured.endsWith("...");
        worker.execute(() -> {
            try { new MonitorClient(this).process(chatKey, label, captured, capturedTime, possiblyTruncated); }
            catch (Exception ignored) { /* No message content is written to Android logs. */ }
        });
    }

    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
