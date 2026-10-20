package dk.hubtech.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Shows a reminder as a notification; tapping it opens HUBTECH on the right page. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
        Reminders.ensureChannel(c);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        int id = in.getIntExtra("id", 1);
        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("hubtech://open" + in.getStringExtra("path")))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, Reminders.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_hubtech)
                .setContentTitle(in.getStringExtra("title"))
                .setContentText(in.getStringExtra("text"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(in.getStringExtra("text")))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try { NotificationManagerCompat.from(c).notify(id, b.build()); } catch (SecurityException ignored) { }
    }
}
