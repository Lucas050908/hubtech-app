#!/usr/bin/env python3
"""Build the integrated CircuitPilot app from the original single-file version.

    python3 tools/build_circuitpilot.py            # sources/cercuitpilot.html -> web/apps/circuitpilot/index.html

All learning content, game logic, labs and the sandbox are kept unchanged. Only these parts are replaced:
  * the browser-only account system (localStorage)  -> HUBTECH account via cp-bridge.js
  * the leaderboard (per browser)                    -> server leaderboard (escaped output)
  * the "accounts on this device" settings block      -> linked-account info
  * registration / switch-account overlays           -> removed (login happens in HUBTECH)
  * styling                                           -> cp-theme.css maps CircuitPilot's variables to HUBTECH tokens
The script fails loudly if the original changed in a way the patches no longer match.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "sources" / "cercuitpilot.html"
OUT = ROOT / "web" / "apps" / "circuitpilot" / "index.html"

s = SRC.read_text(encoding="utf-8")


def sub_line(prefix, replacement):
    """Replace the single line that starts with `prefix`."""
    global s
    pat = re.compile(r"^" + re.escape(prefix) + r".*$", re.M)
    if len(pat.findall(s)) != 1:
        sys.exit(f"patch failed: expected exactly one line starting with {prefix!r}")
    s = pat.sub(lambda m: replacement, s, count=1)


def sub_once(old, new):
    global s
    if s.count(old) != 1:
        sys.exit(f"patch failed: {old[:60]!r} occurs {s.count(old)} times")
    s = s.replace(old, new)


# ── head: language, fonts, theme + bridge ──
sub_once('<html lang="en">', '<html lang="en" data-theme="dark">')
s = re.sub(r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">',
           '<link rel="stylesheet" href="../../fonts/fonts.css">', s, count=1)
sub_once("</style>\n</head>", '</style>\n<link rel="stylesheet" href="cp-theme.css">\n<script src="cp-bridge.js"></script>\n</head>')
sub_once("<title>CercuitPilot – Electronics Academy</title>", "<title>CircuitPilot · HUBTECH</title>")

# ── remove registration + switch overlays (login is handled by HUBTECH) ──
s, n = re.subn(r"<!-- REGISTRATION -->.*?<!-- LVLUP -->", "<!-- LVLUP -->", s, count=1, flags=re.S)
if n != 1:
    sys.exit("patch failed: overlays")

# ── settings: accounts on this device -> linked account ──
sub_once("""    <div class="sec">Accounts on this device</div>
    <div class="sw-row mb" id="acc-list"></div>
    <button class="btn-o mb" onclick="document.getElementById('reg-ov').style.display='flex'">+ Create new account</button>""",
         """    <div class="sec">Account</div>
    <div class="sw-row mb" id="acc-list"></div>""")

# ── account system -> bridge ──
sub_line("function getAcc(){", "function getAcc(){return window.__CP_ACC||null;}")
sub_line("function saveAcc(a){", "function saveAcc(a){window.__CP_ACC=a;window.CPBridge&&CPBridge.save(a);}")
sub_line("function getAllUsers(){", "function getAllUsers(){return [];}")
sub_line("function updateLB(a){", "function updateLB(a){/* leaderboard is computed by the HUBTECH server */}")
sub_line("function createAccount(){", "function createAccount(){/* accounts are HUBTECH accounts */}")
sub_line("function resetAcc(){", "function resetAcc(){if(!confirm('Reset ALL your CircuitPilot progress? This cannot be undone.'))return;const a=getAcc();if(!a)return;saveAcc(emptyAcc(a.username,a.avatar));CPBridge.flush();init();}")
sub_line("function showSwitch(){", "function showSwitch(){}")
sub_line("function switchTo(u){", "function switchTo(u){}")
sub_line("function renderLBs(a){", r"""function cpEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderLBs(a){CPBridge.leaderboard().then(lb=>{const M=['🥇','🥈','🥉'];const byXP=[...lb].sort((x,y)=>y.xp-x.xp);const byR=[...lb].filter(e=>e.race>0).sort((x,y)=>y.race-x.race);const row=(e,i,v)=>`<div class="lb-row${e.me?' me':''}"><span class="lb-rank">${M[i]||i+1}</span><span class="lb-av">${cpEsc(e.av||'👤')}</span><span class="lb-name">${cpEsc(e.u)}</span><span class="lb-xp">${v}</span></div>`;document.getElementById('lb-xp').innerHTML=byXP.length?byXP.slice(0,10).map((e,i)=>row(e,i,e.xp+' XP')).join(''):'<div style="padding:13px;color:var(--txt3);font-size:.82rem">No data yet</div>';document.getElementById('lb-race').innerHTML=byR.length?byR.slice(0,10).map((e,i)=>row(e,i,e.race+' pts')).join(''):'<div style="padding:13px;color:var(--txt3);font-size:.82rem">Play Race Mode to appear here!</div>';});}""")
sub_line("function renderAccList(){", r"""function renderAccList(){const a=getAcc();const li=getLvl(a?a.xp:0);document.getElementById('acc-list').innerHTML=`<div class="sw-btn"><span class="sw-av">${cpEsc(a?.avatar||'👤')}</span><span class="sw-name">${cpEsc(a?.username||'—')}</span><span class="sw-lv">Lv.${li.l} · ${a?.xp||0} XP</span></div><div style="font-size:.75rem;color:var(--txt3);margin-top:6px;line-height:1.5">Linked to your HUBTECH account. Progress is saved on the server and counts towards your platform level. Change name and avatar in HUBTECH → Settings → Profile.</div>`;}""")

# ── init: wait for the bridge, adopt the platform user ──
sub_once("function init(){const a=getAcc();if(!a){",
         "function init(){if(!window.__CP_ACC&&window.CPBridge){const b=window.__CP_BOOT||{};window.__CP_ACC=b.acc||emptyAcc(b.user?.displayName||'Pilot',b.user?.avatar||'⚡');}const a0=getAcc();if(a0&&window.CPBridge?.user){a0.username=CPBridge.user.displayName;a0.avatar=CPBridge.user.avatar;}const a=getAcc();if(!a){")
sub_once("window.addEventListener('load',init);",
         "CPBridge.ready.then(b=>{window.__CP_BOOT=b;CPBridge.user=b.user;if(b.imported)setTimeout(()=>showToast('Imported your browser progress'),800);init();}).catch(()=>{document.body.innerHTML='<div style=\"padding:40px;text-align:center;font-family:sans-serif;color:#fff\">CircuitPilot needs an active HUBTECH session. Please log in again.</div>';});")

# brand spelling used across HUBTECH
s = s.replace('Cercuit<em>Pilot</em>', 'Circuit<em>Pilot</em>').replace('CercuitPilot Certificate', 'CircuitPilot Certificate')

banner = "<!-- Generated by tools/build_circuitpilot.py from sources/cercuitpilot.html — edit the source + rebuild. -->\n"
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(banner + s, encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)} ({len(s) // 1024} KB)")
