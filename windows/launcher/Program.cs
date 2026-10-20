// HUBTECH for Windows (the Microsoft Store app).
// Starts HUBTECH's Python server (bundled in the package, no Python installation needed), shows HUBTECH in a
// WebView2 window and stops the server again when the window is closed. The page can ask for a see-through
// window (Indstillinger → Verden & udseende → Gennemsigtig baggrund); then the desktop wallpaper shows behind HUBTECH.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Hubtech
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    sealed class MainForm : Form
    {
        static readonly Color Dark = Color.FromArgb(10, 20, 34);
        readonly string appDir = AppDomain.CurrentDomain.BaseDirectory;
        readonly string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HUBTECH");
        readonly string token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        int port = 8090;
        Process server;
        StreamWriter serverLog;
        WebView2 web;
        Label status;
        string backdrop = "off";
        bool closing;

        public MainForm()
        {
            Text = "HUBTECH";
            BackColor = Dark;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            StartPosition = FormStartPosition.Manual;
            LoadBounds();
            status = new Label { Text = "Starter HUBTECH …", ForeColor = Color.FromArgb(200, 215, 235), BackColor = Dark, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 13f) };
            Controls.Add(status);
            Shown += async (s, e) => await StartAsync();
            FormClosing += OnClosing;
            HandleCreated += (s, e) => DarkTitleBar(true);
        }

        // ── the server ──
        string Health(int p)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create($"http://127.0.0.1:{p}/api/health");
                req.Timeout = 1500; req.Proxy = null;
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var r = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    return r.ReadToEnd().Contains("\"hubtech\"") ? "hubtech" : "other";
            }
            catch (WebException e) when (e.Response != null) { return "other"; }
            catch { return null; }
        }

        async Task StartAsync()
        {
            try
            {
                Directory.CreateDirectory(dataDir);
                string env = Environment.GetEnvironmentVariable("HUBTECH_PORT");
                if (int.TryParse(env, out int ep) && ep > 0) port = ep;
                string h = await Task.Run(() => Health(port));
                if (h == "other")
                {
                    for (int p = port + 1; p < port + 20; p++) { if (await Task.Run(() => Health(p)) == null) { port = p; h = null; break; } }
                    if (h == "other") throw new Exception($"Port {port} bruges af et andet program.");
                }
                if (h == null) await Task.Run(StartServer);
                await StartWebAsync();
            }
            catch (Exception e)
            {
                status.Text = "HUBTECH kunne ikke starte.\n\n" + e.Message + "\n\nLog: " + Path.Combine(dataDir, "hubtech.log");
            }
        }

        void StartServer()
        {
            string py = Path.Combine(appDir, "python", "python.exe");
            string app = Path.Combine(appDir, "app", "server", "app.py");
            if (!File.Exists(py) || !File.Exists(app)) throw new Exception("Pakken mangler filer. Installér HUBTECH igen fra Microsoft Store.");
            serverLog = new StreamWriter(Path.Combine(dataDir, "hubtech.log"), true, new UTF8Encoding(false)) { AutoFlush = true };
            serverLog.WriteLine($"\n=== HUBTECH startet af Windows-appen {DateTime.Now:yyyy-MM-dd HH:mm:ss} ===");
            var psi = new ProcessStartInfo(py, $"-X utf8 \"{app}\" --port {port}")
            {
                WorkingDirectory = Path.Combine(appDir, "app"),
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            };
            psi.EnvironmentVariables["HUBTECH_LAUNCHER"] = "1";
            psi.EnvironmentVariables["HUBTECH_STORE_APP"] = "1";
            psi.EnvironmentVariables["HUBTECH_SHUTDOWN_TOKEN"] = token;
            psi.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";
            psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            server = new Process { StartInfo = psi, EnableRaisingEvents = true };
            server.OutputDataReceived += (s, e) => { if (e.Data != null) lock (serverLog) serverLog.WriteLine(e.Data); };
            server.ErrorDataReceived += (s, e) => { if (e.Data != null) lock (serverLog) serverLog.WriteLine(e.Data); };
            server.Start();
            server.BeginOutputReadLine(); server.BeginErrorReadLine();
            var until = DateTime.Now.AddSeconds(40);
            while (DateTime.Now < until)
            {
                if (server.HasExited) throw new Exception($"Serveren stoppede med det samme (kode {server.ExitCode}).");
                if (Health(port) == "hubtech") return;
                Thread.Sleep(250);
            }
            throw new Exception("Serveren svarede ikke inden for 40 sekunder.");
        }

        void StopServer()
        {
            if (server == null || server.HasExited) return;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create($"http://127.0.0.1:{port}/api/system/shutdown");
                req.Method = "POST"; req.Timeout = 4000; req.Proxy = null; req.ContentType = "application/json";
                req.Headers["X-Requested-With"] = "hubtech"; req.Headers["X-Hubtech-Shutdown"] = token;
                var body = Encoding.UTF8.GetBytes("{}");
                using (var s = req.GetRequestStream()) s.Write(body, 0, body.Length);
                using (req.GetResponse()) { }
                if (server.WaitForExit(8000)) return;
            }
            catch { }
            try { server.Kill(); server.WaitForExit(3000); } catch { }
        }

        // ── the window ──
        async Task StartWebAsync()
        {
            web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Dark };
            var opts = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
            var envr = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDir, "WebView2"), opts);
            Controls.Add(web);
            await web.EnsureCoreWebView2Async(envr);
            var core = web.CoreWebView2;
            core.Settings.UserAgent += " HubtechDesktop/1";
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            string origin = $"http://127.0.0.1:{port}";
            core.PermissionRequested += (s, e) =>
            {
                if (e.Uri.StartsWith(origin)) e.State = CoreWebView2PermissionState.Allow;   // camera, microphone, notifications for HUBTECH itself
            };
            core.NewWindowRequested += (s, e) =>
            {
                if (!e.Uri.StartsWith(origin)) { e.Handled = true; OpenExternal(e.Uri); }
            };
            core.NavigationStarting += (s, e) =>
            {
                if (!e.Uri.StartsWith(origin) && !e.Uri.StartsWith("about:") && !e.Uri.StartsWith("data:")) { e.Cancel = true; OpenExternal(e.Uri); }
            };
            core.DocumentTitleChanged += (s, e) => { Text = string.IsNullOrWhiteSpace(core.DocumentTitle) ? "HUBTECH" : core.DocumentTitle; };
            core.WebMessageReceived += OnMessage;
            core.ProcessFailed += (s, e) => { if (!closing) core.Reload(); };
            core.Navigate(origin + "/?source=app");
            status.Visible = false;
            web.BringToFront();
        }

        static void OpenExternal(string url)
        {
            if (url.StartsWith("https://") || url.StartsWith("http://") || url.StartsWith("mailto:"))
                try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string json;
            try { json = e.WebMessageAsJson; } catch { return; }
            if (json.Contains("\"backdrop\""))
            {
                string v = json.Contains("\"acrylic\"") ? "acrylic" : json.Contains("\"mica\"") ? "mica" : json.Contains("\"clear\"") ? "clear" : "off";
                SetBackdrop(v);
            }
        }

        // ── see-through window ──
        [StructLayout(LayoutKind.Sequential)] struct Margins { public int L, R, T, B; }
        [StructLayout(LayoutKind.Sequential)] struct AccentPolicy { public int State, Flags, Color, Anim; }
        [StructLayout(LayoutKind.Sequential)] struct CompData { public int Attr; public IntPtr Data; public int Size; }
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);
        [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref Margins m);
        [DllImport("user32.dll")] static extern int SetWindowCompositionAttribute(IntPtr h, ref CompData d);

        void DarkTitleBar(bool on)
        {
            int v = on ? 1 : 0;
            try { if (DwmSetWindowAttribute(Handle, 20, ref v, 4) != 0) DwmSetWindowAttribute(Handle, 19, ref v, 4); } catch { }
        }

        void Accent(int state, int color)
        {
            var a = new AccentPolicy { State = state, Flags = 2, Color = color };
            int size = Marshal.SizeOf(a);
            IntPtr p = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(a, p, false);
                var d = new CompData { Attr = 19, Data = p, Size = size };   // WCA_ACCENT_POLICY
                SetWindowCompositionAttribute(Handle, ref d);
            }
            catch { }
            finally { Marshal.FreeHGlobal(p); }
        }

        void SetBackdrop(string v)
        {
            if (v == backdrop || web == null) return;
            backdrop = v;
            try
            {
                bool win11 = Environment.OSVersion.Version.Build >= 22621;
                int none = 1;
                if (v == "off")
                {
                    Accent(0, 0);
                    if (win11) DwmSetWindowAttribute(Handle, 38, ref none, 4);
                    var m0 = new Margins();
                    DwmExtendFrameIntoClientArea(Handle, ref m0);
                    BackColor = Dark;
                    web.DefaultBackgroundColor = Dark;
                    return;
                }
                BackColor = Color.Black;                  // black = "show what is behind" for the DWM frame
                web.DefaultBackgroundColor = Color.Transparent;
                var m = new Margins { L = -1, R = -1, T = -1, B = -1 };
                DwmExtendFrameIntoClientArea(Handle, ref m);
                if (v == "mica" && win11) { Accent(0, 0); int mica = 2; DwmSetWindowAttribute(Handle, 38, ref mica, 4); }
                else if (v == "clear") { if (win11) DwmSetWindowAttribute(Handle, 38, ref none, 4); Accent(2, 0x00000000); }   // fully clear
                else { if (win11) DwmSetWindowAttribute(Handle, 38, ref none, 4); Accent(4, 0x66221408); }                      // acrylic blur, tinted
            }
            catch { backdrop = "off"; BackColor = Dark; if (web != null) web.DefaultBackgroundColor = Dark; }
        }

        // ── size and position are remembered ──
        string BoundsFile => Path.Combine(dataDir, "window.txt");
        void LoadBounds()
        {
            var wa = Screen.PrimaryScreen.WorkingArea;
            Bounds = new Rectangle(wa.X + wa.Width / 10, wa.Y + wa.Height / 10, wa.Width * 8 / 10, wa.Height * 8 / 10);
            try
            {
                var p = File.ReadAllText(BoundsFile).Split(',');
                var r = new Rectangle(int.Parse(p[0]), int.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]));
                foreach (var s in Screen.AllScreens) if (s.WorkingArea.IntersectsWith(r) && r.Width >= 400 && r.Height >= 300) { Bounds = r; break; }
                if (p.Length > 4 && p[4] == "max") WindowState = FormWindowState.Maximized;
            }
            catch { }
            MinimumSize = new Size(360, 480);
        }

        void OnClosing(object sender, FormClosingEventArgs e)
        {
            closing = true;
            try
            {
                var r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                File.WriteAllText(BoundsFile, $"{r.X},{r.Y},{r.Width},{r.Height},{(WindowState == FormWindowState.Maximized ? "max" : "normal")}");
            }
            catch { }
            StopServer();   // only the server this window started
            try { serverLog?.Dispose(); } catch { }
        }
    }
}
