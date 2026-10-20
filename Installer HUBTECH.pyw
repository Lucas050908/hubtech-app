"""Installer HUBTECH – puts a HUBTECH icon on the desktop and in the Start menu.

Double-click once. The shortcut starts "HUBTECH.pyw" with Python without a console
window, so HUBTECH opens like a normal program. Nothing is copied or downloaded –
the shortcut points at this folder, so keep the folder where it is (or run the
installer again after moving it). Run it again to remove the shortcuts.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LAUNCHER = ROOT / "HUBTECH.pyw"
ICON_ICO = ROOT / "hubtech.ico"
ICON_PNG = ROOT / "web" / "assets" / "icons" / "app-512.png"
WINDOWS = os.name == "nt"
MAC = sys.platform == "darwin"
NAME = "HUBTECH"


def gui_python():
    exe = Path(sys.executable)
    if WINDOWS:
        w = exe.with_name("pythonw.exe")
        return str(w if w.exists() else exe)
    return str(exe)


# ── Windows ──────────────────────────────────────────────────────────────
def _ps(script):
    flags = 0x08000000  # CREATE_NO_WINDOW
    r = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                       capture_output=True, text=True, creationflags=flags, timeout=60)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout or "PowerShell fejlede").strip())
    return r.stdout.strip()


def _q(s):
    return "'" + str(s).replace("'", "''") + "'"


def win_folders():
    out = _ps("[Environment]::GetFolderPath('Desktop'); [Environment]::GetFolderPath('Programs')").splitlines()
    return [Path(p.strip()) for p in out if p.strip()]


def win_install():
    script = f"""
$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {{
  $lnk = $ws.CreateShortcut((Join-Path $dir '{NAME}.lnk'))
  $lnk.TargetPath = {_q(gui_python())}
  $lnk.Arguments = '"' + {_q(LAUNCHER)} + '"'
  $lnk.WorkingDirectory = {_q(ROOT)}
  $lnk.IconLocation = {_q(str(ICON_ICO) + ',0')}
  $lnk.Description = 'HUBTECH – din platform'
  $lnk.WindowStyle = 1
  $lnk.Save()
}}
"""
    _ps(script)
    return [d / f"{NAME}.lnk" for d in win_folders()]


def win_uninstall():
    removed = []
    for d in win_folders():
        p = d / f"{NAME}.lnk"
        if p.exists():
            p.unlink()
            removed.append(p)
    return removed


def win_installed():
    try:
        return any((d / f"{NAME}.lnk").exists() for d in win_folders())
    except Exception:
        return False


# ── Linux ────────────────────────────────────────────────────────────────
def _linux_paths():
    apps = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "applications"
    desk = Path.home() / "Desktop"
    try:
        out = subprocess.run(["xdg-user-dir", "DESKTOP"], capture_output=True, text=True, timeout=5).stdout.strip()
        if out:
            desk = Path(out)
    except Exception:
        pass
    return [apps / "hubtech.desktop"] + ([desk / "hubtech.desktop"] if desk.is_dir() else [])


def linux_install():
    entry = (f"[Desktop Entry]\nType=Application\nName={NAME}\nComment=HUBTECH – din platform\n"
             f"Exec=\"{gui_python()}\" \"{LAUNCHER}\"\nPath={ROOT}\nIcon={ICON_PNG}\nTerminal=false\n"
             "Categories=Office;Education;\nStartupWMClass=HUBTECH\n")
    done = []
    for p in _linux_paths():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(entry, encoding="utf-8")
        p.chmod(0o755)
        done.append(p)
    return done


def linux_uninstall():
    removed = []
    for p in _linux_paths():
        if p.exists():
            p.unlink()
            removed.append(p)
    return removed


# ── macOS ────────────────────────────────────────────────────────────────
def _mac_app():
    return Path.home() / "Applications" / f"{NAME}.app"


def mac_install():
    app = _mac_app()
    if app.exists():
        shutil.rmtree(app)
    (app / "Contents" / "MacOS").mkdir(parents=True)
    (app / "Contents" / "Resources").mkdir()
    run = app / "Contents" / "MacOS" / NAME
    run.write_text(f"#!/bin/sh\ncd \"{ROOT}\"\nexec \"{gui_python()}\" \"{LAUNCHER}\"\n", encoding="utf-8")
    run.chmod(0o755)
    try:
        subprocess.run(["sips", "-s", "format", "icns", str(ICON_PNG), "--out", str(app / "Contents" / "Resources" / "hubtech.icns")],
                       capture_output=True, timeout=30)
    except Exception:
        pass
    (app / "Contents" / "Info.plist").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>{NAME}</string><key>CFBundleExecutable</key><string>{NAME}</string>
<key>CFBundleIdentifier</key><string>local.hubtech.app</string><key>CFBundleIconFile</key><string>hubtech</string>
<key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/>
</dict></plist>
""", encoding="utf-8")
    return [app]


def mac_uninstall():
    app = _mac_app()
    if app.exists():
        shutil.rmtree(app)
        return [app]
    return []


# ── dispatch + small window ──────────────────────────────────────────────
def install():
    return win_install() if WINDOWS else mac_install() if MAC else linux_install()


def uninstall():
    return win_uninstall() if WINDOWS else mac_uninstall() if MAC else linux_uninstall()


def installed():
    if WINDOWS:
        return win_installed()
    if MAC:
        return _mac_app().exists()
    return any(p.exists() for p in _linux_paths())


def main():
    if "--install" in sys.argv or "--uninstall" in sys.argv:  # for scripts/tests
        paths = install() if "--install" in sys.argv else uninstall()
        for p in paths:
            print(p)
        return
    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.title("Installer HUBTECH")
    root.configure(bg="#0a1422")
    root.resizable(False, False)
    if WINDOWS and ICON_ICO.exists():
        try:
            root.iconbitmap(str(ICON_ICO))
        except Exception:
            pass
    w, h = 440, 250
    root.geometry(f"{w}x{h}+{(root.winfo_screenwidth() - w) // 2}+{(root.winfo_screenheight() - h) // 3}")
    fg, sub, bg = "#f4f8fc", "#8fb3d9", "#0a1422"
    tk.Label(root, text="HUBTECH", fg=fg, bg=bg, font=("Segoe UI", 22, "bold")).pack(pady=(22, 2))
    where = "skrivebordet og i startmenuen" if WINDOWS else "Programmer (~/Applications)" if MAC else "skrivebordet og programmenuen"
    status = tk.Label(root, fg=sub, bg=bg, font=("Segoe UI", 10), wraplength=390, justify="center")
    status.pack(pady=(4, 16))
    btns = tk.Frame(root, bg=bg)
    btns.pack()

    def refresh():
        on = installed()
        status.config(text=(f"HUBTECH er installeret på {where}.\nStart HUBTECH med ikonet – vinduet lukker serveren, når du lukker det."
                            if on else f"Lægger et HUBTECH-ikon på {where}.\nIkonet åbner HUBTECH i sit eget vindue – uden konsol og browserfaner."))
        main_btn.config(text="Installér igen" if on else "Installér HUBTECH")
        un_btn.config(state="normal" if on else "disabled")

    def do_install():
        try:
            install()
            refresh()
            if messagebox.askyesno("HUBTECH", f"HUBTECH er installeret på {where}.\n\nVil du starte HUBTECH nu?"):
                kw = {"creationflags": 0x08000000} if WINDOWS else {"start_new_session": True}
                subprocess.Popen([gui_python(), str(LAUNCHER)], cwd=str(ROOT), **kw)
                root.destroy()
        except Exception as e:
            messagebox.showerror("HUBTECH", f"Kunne ikke lave genvejen:\n\n{e}")

    def do_uninstall():
        try:
            uninstall()
            refresh()
            messagebox.showinfo("HUBTECH", "Genvejene er fjernet. Dine data i .hubtech-mappen er ikke rørt.")
        except Exception as e:
            messagebox.showerror("HUBTECH", f"Kunne ikke fjerne genvejene:\n\n{e}")

    style = dict(font=("Segoe UI", 10, "bold"), bd=0, padx=16, pady=8, cursor="hand2", activeforeground=fg)
    main_btn = tk.Button(btns, command=do_install, bg="#2f7dff", fg="#ffffff", activebackground="#4a90ff", **style)
    main_btn.pack(side="left", padx=6)
    un_btn = tk.Button(btns, text="Fjern genveje", command=do_uninstall, bg="#1b2a40", fg=fg, activebackground="#24385a", **style)
    un_btn.pack(side="left", padx=6)
    refresh()
    root.mainloop()


if __name__ == "__main__":
    main()
