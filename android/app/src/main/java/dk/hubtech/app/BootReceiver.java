package dk.hubtech.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are cleared when the phone restarts (or the app is updated) – schedule the saved reminders again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
        String a = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            Reminders.restore(c);
            NotifyJob.sync(c);
        }
    }
}
