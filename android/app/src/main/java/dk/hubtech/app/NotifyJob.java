package dk.hubtech.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.CookieManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Notifications from a shared HUBTECH server while the app is closed: about every 15 minutes (Android decides the
 * exact time, and only with internet) the app asks the server's inbox (GET /api/notify/inbox?since=N) for news and
 * shows it. Only used when the app is connected to another server – the app's own server has no one else on it.
 */
public class NotifyJob extends JobService {
    static final String CHANNEL = "hubtech_social";
    static final int JOB_ID = 4711;

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_social), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_social_desc));
        nm.createNotificationChannel(ch);
    }

    /** Start or stop the background check to match the settings. */
    static void sync(Context c) {
        SharedPreferences p = c.getSharedPreferences("hubtech", MODE_PRIVATE);
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        boolean want = !p.getString("remote", "").isEmpty() && p.getBoolean("bgNotify", true);
        if (!want) { js.cancel(JOB_ID); return; }
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(c, NotifyJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true);
        try { js.schedule(b.build()); } catch (RuntimeException ignored) { }
    }

    static void show(Context c, int id, String title, String text, String path, boolean call) {
        ensureChannel(c);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("hubtech://open" + (path == null || !path.startsWith("/") ? "/" : path)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_hubtech)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(call ? NotificationCompat.CATEGORY_EVENT : NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try { NotificationManagerCompat.from(c).notify(id, b.build()); } catch (SecurityException ignored) { }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { check(getApplicationContext()); } catch (Exception ignored) { }
            jobFinished(params, false);
        }, "hubtech-notify").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    static void check(Context c) throws Exception {
        SharedPreferences p = c.getSharedPreferences("hubtech", MODE_PRIVATE);
        String base = p.getString("remote", "");
        if (base.isEmpty()) return;
        String cookie = CookieManager.getInstance().getCookie(base);
        if (cookie == null || cookie.isEmpty()) return;               // not logged in
        long since = p.getLong("notifySince", -1);
        HttpURLConnection con = (HttpURLConnection) new URL(base + "/api/notify/inbox?since=" + since).openConnection();
        con.setConnectTimeout(10000); con.setReadTimeout(15000);
        con.setRequestProperty("Cookie", cookie);
        con.setRequestProperty("X-Requested-With", "hubtech");
        if (con.getResponseCode() != 200) return;
        String body;
        try (InputStream is = con.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int n; while ((n = is.read(buf)) > 0 && bo.size() < 256 * 1024) bo.write(buf, 0, n); body = bo.toString("UTF-8");
        }
        JSONObject o = new JSONObject(body);
        JSONArray items = o.optJSONArray("items");
        long last = o.optLong("last", since);
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                show(c, 20000 + (int) (it.optLong("id") % 100000), it.optString("title", "HUBTECH"), it.optString("text", ""), it.optString("path", "/"), "call".equals(it.optString("kind")));
            }
        }
        p.edit().putLong("notifySince", Math.max(last, since)).apply();
    }
}
