package dk.hubtech.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reminders as real Android notifications: the web app sends the upcoming reminders (tasks + calendar),
 * they are scheduled with AlarmManager and survive closing the app and restarting the phone (BootReceiver).
 */
public final class Reminders {
    static final String CHANNEL = "reminders";
    private static final String PREFS = "hubtech";
    private static final String KEY = "reminders";
    private static final String IDS = "reminderIds";

    private Reminders() { }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_reminders_desc));
        nm.createNotificationChannel(ch);
    }

    /** Replace all scheduled reminders with this list: [{id, at, title, text, path}]. */
    static int schedule(Context c, String json) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        cancelAll(c, p);
        JSONArray list;
        try { list = new JSONArray(json == null ? "[]" : json); } catch (Exception e) { list = new JSONArray(); }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long now = System.currentTimeMillis();
        JSONArray kept = new JSONArray();
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < list.length() && kept.length() < 64; i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            long at = r.optLong("at", 0);
            if (at <= now) continue;
            int code = r.optString("id", String.valueOf(i)).hashCode();
            PendingIntent pi = pending(c, r, code);
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            try {
                if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
            kept.put(r);
            ids.append(code).append(',');
        }
        p.edit().putString(KEY, kept.toString()).putString(IDS, ids.toString()).apply();
        return kept.length();
    }

    /** After a reboot: schedule what was saved. */
    static void restore(Context c) {
        String saved = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]");
        schedule(c, saved);
    }

    private static void cancelAll(Context c, SharedPreferences p) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        String ids = p.getString(IDS, "");
        for (String s : ids.split(",")) {
            if (s.isEmpty()) continue;
            try {
                Intent i = new Intent(c, ReminderReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(c, Integer.parseInt(s), i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            } catch (NumberFormatException ignored) { }
        }
    }

    private static PendingIntent pending(Context c, JSONObject r, int code) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.putExtra("id", code);
        i.putExtra("title", r.optString("title", "HUBTECH"));
        i.putExtra("text", r.optString("text", ""));
        i.putExtra("path", r.optString("path", "/"));
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
