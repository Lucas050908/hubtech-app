package dk.hubtech.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "I dag" on the home screen. The web app sends a small summary (HubtechAndroid.updateWidget) whenever the
 * home page or the data changes; the widget shows it and opens HUBTECH when tapped.
 */
public class TodayWidget extends AppWidgetProvider {
    private static final int[] LINES = { R.id.w_line1, R.id.w_line2, R.id.w_line3, R.id.w_line4, R.id.w_line5 };

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids.length > 0) for (int id : ids) m.updateAppWidget(id, views(c));
    }

    private static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        String json = c.getSharedPreferences("hubtech", Context.MODE_PRIVATE).getString("widget", null);
        String title = c.getString(R.string.widget_title), sub = c.getString(R.string.widget_empty);
        JSONArray lines = new JSONArray();
        try {
            if (json != null) {
                JSONObject o = new JSONObject(json);
                title = o.optString("title", title);
                sub = o.optString("sub", "");
                lines = o.optJSONArray("lines") != null ? o.optJSONArray("lines") : lines;
            }
        } catch (Exception ignored) { }
        v.setTextViewText(R.id.w_title, title);
        v.setTextViewText(R.id.w_sub, sub);
        for (int i = 0; i < LINES.length; i++) {
            if (i < lines.length()) { v.setTextViewText(LINES[i], lines.optString(i)); v.setViewVisibility(LINES[i], View.VISIBLE); }
            else v.setViewVisibility(LINES[i], View.GONE);
        }
        Intent open = new Intent(c, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("hubtech://open/"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
