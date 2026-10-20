package dk.hubtech.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * HUBTECH for Android: starts the HUBTECH server (Python, via Chaquopy) on this phone and shows it
 * in a WebView. All data stays in the app's private storage (files/hubtech). No computer needed.
 * Native extras: reminders as notifications, a home screen widget, shortcuts, "Del til HUBTECH",
 * camera (photos + scanning), printing, an app lock and installing updates.
 */
public class MainActivity extends AppCompatActivity {
    private static final int PICK_FILE = 4711, REQ_CAMERA = 11, REQ_NOTIFY = 12, REQ_CAMERA_CHOOSER = 13;
    private static final long LOCK_AFTER_MS = 30_000;
    private WebView web, printWeb;
    private View splash, lockView;
    private TextView splashText;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingChooser;
    private PermissionRequest pendingPermission;
    private Uri cameraUri;
    private int port = 0;
    private String pendingPath = null;
    private long stoppedAt = 0, updateDownload = -1;
    private boolean unlocked = false;
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("hubtech", MODE_PRIVATE);
        Reminders.ensureChannel(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0A1422"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A1422"));
        web.setVisibility(View.INVISIBLE);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splash = buildSplash();
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        lockView = buildLock();
        lockView.setVisibility(View.GONE);
        root.addView(lockView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupWebView();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); }
            }
        });
        handleIntent(getIntent());
        startServer();
    }

    // ── splash / first start ──
    private View buildSplash() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#0A1422"));
        TextView title = new TextView(this);
        title.setText("HUBTECH");
        title.setTextColor(Color.parseColor("#F4F8FC"));
        title.setTextSize(30);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        box.addView(title);
        ProgressBar spinner = new ProgressBar(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = 40;
        box.addView(spinner, lp);
        splashText = new TextView(this);
        // the first start after installing / updating unpacks the server and web app – say so
        boolean first = prefs.getLong("startedVersion", -1) != versionCode();
        splashText.setText(first ? R.string.first_start : R.string.starting);
        splashText.setTextColor(Color.parseColor("#8FB3D9"));
        splashText.setPadding(48, 32, 48, 0);
        splashText.setGravity(Gravity.CENTER);
        box.addView(splashText);
        return box;
    }

    private long versionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " HUBTECH-Android");
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "HubtechAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost();
                if (("127.0.0.1".equals(host) || "localhost".equals(host)) && u.getPort() == port) return false;
                // links to other sites (and tel:/mailto:) open in the phone's own apps
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (splash.getVisibility() == View.VISIBLE) {
                    prefs.edit().putLong("startedVersion", versionCode()).apply();
                    web.setVisibility(View.VISIBLE);
                    splash.animate().alpha(0f).setDuration(220).withEndAction(() -> splash.setVisibility(View.GONE));
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean wantsImages = false;
                for (String a : params.getAcceptTypes()) if (a == null || a.isEmpty() || a.startsWith("image") || a.equals("*/*")) wantsImages = true;
                if (wantsImages && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                        && !prefs.getBoolean("cameraAsked", false)) {
                    prefs.edit().putBoolean("cameraAsked", true).apply();
                    pendingChooser = params;
                    requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAMERA_CHOOSER);
                    return true;
                }
                return openChooser(params, wantsImages);
            }

            // getUserMedia (the barcode/QR scanner) – grant the camera when Android allows it
            @Override public void onPermissionRequest(PermissionRequest request) {
                ui.post(() -> {
                    boolean video = false;
                    for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) video = true;
                    if (!video) { request.deny(); return; }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    } else {
                        pendingPermission = request;
                        requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAMERA);
                    }
                });
            }
        });

        // plain http downloads (e.g. a backup .db) – the session cookie is passed along
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) return;   // handled by the JS bridge
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.addRequestHeader("User-Agent", userAgent);
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, getString(R.string.saved_to, name), Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
            }
        });
    }

    /** File chooser – with "take a photo" offered next to the gallery when images are accepted. */
    private boolean openChooser(WebChromeClient.FileChooserParams params, boolean wantsImages) {
        try {
            Intent pick = params.createIntent();
            Intent chooser = Intent.createChooser(pick, null);
            cameraUri = null;
            if (wantsImages && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                File dir = new File(getCacheDir(), "camera");
                if (dir.exists() || dir.mkdirs()) {
                    File f = new File(dir, "foto-" + System.currentTimeMillis() + ".jpg");
                    cameraUri = FileProvider.getUriForFile(this, "dk.hubtech.app.files", f);
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (params.isCaptureEnabled()) chooser = cam;
                    else chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { cam });
                }
            }
            startActivityForResult(chooser, PICK_FILE);
            return true;
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_CAMERA && pendingPermission != null) {
            if (ok) pendingPermission.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            else { pendingPermission.deny(); Toast.makeText(this, R.string.camera_denied, Toast.LENGTH_LONG).show(); }
            pendingPermission = null;
        } else if (code == REQ_CAMERA_CHOOSER && pendingChooser != null) {
            WebChromeClient.FileChooserParams p = pendingChooser;
            pendingChooser = null;
            openChooser(p, true);
        } else if (code == REQ_NOTIFY) {
            js("window.dispatchEvent(new CustomEvent('hubtech-notify', { detail: " + ok + " }))");
        }
    }

    // ── server start + opening pages ──
    private void startServer() {
        final File dataDir = new File(getFilesDir(), "hubtech");
        bg.execute(() -> {
            try {
                Python py = Python.getInstance();
                PyObject res = py.getModule("android_main").callAttr("start", dataDir.getAbsolutePath());
                port = res.toInt();
                ui.post(() -> {
                    String start = pendingPath != null ? "/#" + pendingPath : "/?source=app";
                    pendingPath = null;
                    web.loadUrl(base() + start);
                });
            } catch (Throwable t) {
                ui.post(() -> splashText.setText(getString(R.string.start_failed) + "\n\n" + t.getMessage()));
            }
        });
    }

    private String base() { return "http://127.0.0.1:" + port; }

    private void openPath(String path) {
        if (path == null || path.isEmpty()) path = "/";
        if (!path.startsWith("/")) path = "/" + path;
        if (port == 0) { pendingPath = path; return; }
        final String p = path;
        js("location.hash = " + JSONObject.quote(p) + ";");
    }

    private void js(String code) { ui.post(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /** hubtech://open/apps/... from shortcuts, notifications and the widget; ACTION_SEND from other apps. */
    private void handleIntent(Intent in) {
        if (in == null) return;
        String action = in.getAction();
        if (Intent.ACTION_VIEW.equals(action) && in.getData() != null && "hubtech".equals(in.getData().getScheme())) {
            Uri d = in.getData();
            String path = d.getPath() == null ? "/" : d.getPath();
            if (d.getQuery() != null) path += "?" + d.getQuery();
            openPath(path);
        } else if (Intent.ACTION_SEND.equals(action)) {
            String type = in.getType() == null ? "" : in.getType();
            if (type.startsWith("text/")) {
                String text = in.getStringExtra(Intent.EXTRA_TEXT), subject = in.getStringExtra(Intent.EXTRA_SUBJECT);
                openPath("/share?text=" + enc(text) + (subject != null ? "&title=" + enc(subject) : ""));
            } else if (type.startsWith("image/")) {
                Uri img = in.getParcelableExtra(Intent.EXTRA_STREAM);
                if (img != null) shareImage(img, type);
            }
        }
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s == null ? "" : s, "UTF-8"); } catch (Exception e) { return ""; }
    }

    /** A shared picture is stored on this phone's HUBTECH (like an Office image) and then offered on /share. */
    private void shareImage(Uri img, String type) {
        Toast.makeText(this, R.string.share_sending, Toast.LENGTH_SHORT).show();
        bg.execute(() -> {
            String path;
            try {
                while (port == 0) SystemClock.sleep(200);
                byte[] bytes;
                try (InputStream is = getContentResolver().openInputStream(img); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = is.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 15 * 1024 * 1024) break; }
                    bytes = bo.toByteArray();
                }
                HttpURLConnection c = (HttpURLConnection) new URL(base() + "/api/office/files").openConnection();
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("X-Requested-With", "hubtech");
                c.setRequestProperty("Content-Type", type);
                c.setRequestProperty("X-File-Name", "delt-billede");
                String cookie = CookieManager.getInstance().getCookie(base());
                if (cookie != null) c.setRequestProperty("Cookie", cookie);
                try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                int code = c.getResponseCode();
                if (code == 201 || code == 200) {
                    String body;
                    try (InputStream is = c.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[4096]; int n; while ((n = is.read(buf)) > 0) bo.write(buf, 0, n); body = bo.toString("UTF-8");
                    }
                    path = "/share?image=" + enc(new JSONObject(body).getJSONObject("file").getString("url"));
                } else path = "/share?error=" + (code == 401 ? "login" : "image");
            } catch (Exception e) { path = "/share?error=image"; }
            final String p = path;
            ui.post(() -> openPath(p));
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if ((result == null || result.length == 0) && resultCode == RESULT_OK && cameraUri != null) result = new Uri[] { cameraUri };
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    // ── app lock (fingerprint / face / screen lock) ──
    private View buildLock() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#0A1422"));
        box.setClickable(true);
        TextView t = new TextView(this);
        t.setText(R.string.lock_title);
        t.setTextColor(Color.parseColor("#F4F8FC"));
        t.setTextSize(22);
        t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        box.addView(t);
        TextView s = new TextView(this);
        s.setText(R.string.lock_sub);
        s.setTextColor(Color.parseColor("#8FB3D9"));
        s.setPadding(48, 16, 48, 32);
        s.setGravity(Gravity.CENTER);
        box.addView(s);
        Button b = new Button(this);
        b.setText(R.string.lock_retry);
        b.setOnClickListener(v -> promptUnlock());
        box.addView(b);
        return box;
    }

    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private boolean lockAvailable() { return BiometricManager.from(this).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS; }

    private boolean lockEnabled() { return prefs.getBoolean("lock", false) && lockAvailable(); }

    private void promptUnlock() {
        BiometricPrompt p = new BiometricPrompt(this, ContextCompat.getMainExecutor(this), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                unlocked = true;
                lockView.animate().alpha(0f).setDuration(160).withEndAction(() -> { lockView.setVisibility(View.GONE); lockView.setAlpha(1f); });
            }
        });
        p.authenticate(new BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.lock_title))
                .setSubtitle(getString(R.string.lock_sub))
                .setAllowedAuthenticators(AUTH)
                .build());
    }

    @Override protected void onStart() {
        super.onStart();
        boolean away = stoppedAt == 0 || SystemClock.elapsedRealtime() - stoppedAt > LOCK_AFTER_MS;
        if (lockEnabled() && (!unlocked || away)) {
            unlocked = false;
            lockView.setVisibility(View.VISIBLE);
            ui.postDelayed(this::promptUnlock, 250);
        }
        js("window.dispatchEvent(new Event('hubtech-resume'))");
    }

    @Override protected void onStop() { super.onStop(); stoppedAt = SystemClock.elapsedRealtime(); }

    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }

    @Override protected void onDestroy() {
        if (updateReceiver != null) try { unregisterReceiver(updateReceiver); } catch (Exception ignored) { }
        super.onDestroy();
    }

    // ── updates: download the new APK and hand it to Android's installer ──
    private BroadcastReceiver updateReceiver;

    private boolean startUpdate(String url) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, R.string.update_allow, Toast.LENGTH_LONG).show();
            try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
            return false;
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) return false;
        File apk = new File(dir, "hubtech-update.apk");
        if (apk.exists()) //noinspection ResultOfMethodCallIgnored
            apk.delete();
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                .setTitle("HUBTECH")
                .setDescription(getString(R.string.update_downloading))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "hubtech-update.apk");
        if (updateReceiver == null) {
            updateReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != updateDownload) return;
                    DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
                    boolean ok = false;
                    try (android.database.Cursor cur = dm.query(q)) {
                        if (cur != null && cur.moveToFirst()) ok = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
                    }
                    if (!ok || !apk.exists()) { Toast.makeText(c, R.string.update_failed, Toast.LENGTH_LONG).show(); return; }
                    Uri u = FileProvider.getUriForFile(c, "dk.hubtech.app.files", apk);
                    Intent inst = new Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    try { startActivity(inst); } catch (Exception e) { Toast.makeText(c, R.string.update_failed, Toast.LENGTH_LONG).show(); }
                }
            };
            ContextCompat.registerReceiver(this, updateReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        }
        updateDownload = dm.enqueue(r);
        Toast.makeText(this, R.string.update_downloading, Toast.LENGTH_SHORT).show();
        return true;
    }

    /** Called from the web app (window.HubtechAndroid). */
    private class Bridge {
        @JavascriptInterface
        public boolean saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "-");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/HUBTECH");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IllegalStateException("no uri");
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
                } else {
                    File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "HUBTECH");
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no dir");
                    try (OutputStream out = new FileOutputStream(new File(dir, safe))) { out.write(bytes); }
                }
                ui.post(() -> Toast.makeText(MainActivity.this, getString(R.string.saved_to, "HUBTECH/" + safe), Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(MainActivity.this, R.string.save_failed, Toast.LENGTH_LONG).show());
                return false;
            }
        }

        @JavascriptInterface public boolean isAndroidApp() { return true; }

        @JavascriptInterface public String appInfo() {
            try { return new JSONObject().put("versionCode", versionCode()).put("versionName", versionName()).put("sdk", Build.VERSION.SDK_INT).toString(); }
            catch (Exception e) { return "{}"; }
        }

        // reminders → notifications
        @JavascriptInterface public int scheduleReminders(String json) { return Reminders.schedule(MainActivity.this, json); }

        @JavascriptInterface public String notificationState() {
            if (Build.VERSION.SDK_INT < 33) return "granted";
            return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ? "granted" : "default";
        }

        @JavascriptInterface public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33) ui.post(() -> requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFY));
        }

        // home screen widget
        @JavascriptInterface public void updateWidget(String json) {
            prefs.edit().putString("widget", json).apply();
            TodayWidget.refresh(MainActivity.this);
        }

        // printing through Android's print service (printers and "Gem som PDF")
        @JavascriptInterface public void printHtml(String title, String html, String baseUrl) {
            ui.post(() -> {
                printWeb = new WebView(MainActivity.this);
                printWeb.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        boolean landscape = html.contains("size: A4 landscape");
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(landscape ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4)
                                .build();
                        pm.print(title, view.createPrintDocumentAdapter(title), attrs);
                    }
                });
                printWeb.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null);
            });
        }

        // app lock
        @JavascriptInterface public boolean lockAvailable() { return MainActivity.this.lockAvailable(); }
        @JavascriptInterface public boolean lockEnabled() { return prefs.getBoolean("lock", false); }
        @JavascriptInterface public void setLock(boolean on) {
            prefs.edit().putBoolean("lock", on).apply();
            if (on) unlocked = true;     // you just proved it's you by turning it on
        }

        // updates
        @JavascriptInterface public boolean installUpdate(String url) {
            final boolean[] ok = { false };
            ui.post(() -> ok[0] = startUpdate(url));
            return true;
        }
    }
}
