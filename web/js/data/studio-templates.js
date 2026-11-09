/** Starting points for App-værkstedet. Plain HTML, CSS and JavaScript – no libraries. */
const page = (title, body, extraHead = '') => `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">${extraHead}
</head>
<body>
${body}
  <script src="app.js"></script>
</body>
</html>
`;

const BASE_CSS = `:root { color-scheme: light dark; --bg: #0f1c2e; --card: #16263d; --text: #eef4fb; --muted: #9fb0c4; --accent: #4cc2ff; }
@media (prefers-color-scheme: light) { :root { --bg: #eef3f9; --card: #ffffff; --text: #0c1a2b; --muted: #50637a; --accent: #0a84d6; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; font: 16px/1.5 system-ui, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); display: grid; place-items: center; padding: 16px; }
.card { width: min(420px, 100%); background: var(--card); border-radius: 18px; padding: 20px; box-shadow: 0 20px 50px -20px rgba(0,0,0,.5); }
h1 { margin: 0 0 12px; font-size: 1.4rem; }
button { font: inherit; border: 0; border-radius: 12px; padding: 10px 14px; background: var(--accent); color: #04121f; font-weight: 700; cursor: pointer; }
button:active { transform: scale(.97); }
input { font: inherit; padding: 10px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--muted) 40%, transparent); background: transparent; color: var(--text); }
`;

export const TEMPLATES = [
  { id: 'blank', name: 'Tom app', icon: '🧩', description: 'En tom side at bygge videre på.', files: {
    'index.html': page('Min app', `  <main class="card">
    <h1>Hej verden 👋</h1>
    <p id="msg">Ret i filerne, og tryk Kør.</p>
    <button id="btn">Klik på mig</button>
  </main>`),
    'style.css': BASE_CSS,
    'app.js': `const btn = document.getElementById('btn');
let clicks = Number(localStorage.getItem('clicks') || 0);
btn.addEventListener('click', () => {
  clicks++;
  localStorage.setItem('clicks', clicks);   // gemmes på din konto
  document.getElementById('msg').textContent = 'Du har klikket ' + clicks + ' gange.';
});
`,
  } },
  { id: 'todo', name: 'To-do-liste', icon: '✅', description: 'Opgaver der gemmes, så de er der næste gang.', files: {
    'index.html': page('To-do', `  <main class="card">
    <h1>Mine opgaver</h1>
    <form id="form"><input id="text" placeholder="Ny opgave" autocomplete="off" required> <button>Tilføj</button></form>
    <ul id="list"></ul>
    <p class="muted" id="count"></p>
  </main>`),
    'style.css': BASE_CSS + `form { display: flex; gap: 8px; } form input { flex: 1; min-width: 0; }
ul { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 6px; }
li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 10%, transparent); }
li.done span { text-decoration: line-through; color: var(--muted); }
li span { flex: 1; } li button { background: transparent; color: var(--muted); padding: 4px 8px; }
.muted { color: var(--muted); font-size: .9rem; }
`,
    'app.js': `let todos = JSON.parse(localStorage.getItem('todos') || '[]');
const list = document.getElementById('list');
const save = () => { localStorage.setItem('todos', JSON.stringify(todos)); draw(); };
function draw() {
  list.innerHTML = '';
  todos.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done;
    cb.onchange = () => { t.done = cb.checked; save(); };
    const span = document.createElement('span'); span.textContent = t.text;
    const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Slet';
    del.onclick = () => { todos.splice(i, 1); save(); };
    li.append(cb, span, del);
    list.append(li);
  });
  const left = todos.filter(t => !t.done).length;
  document.getElementById('count').textContent = todos.length ? left + ' tilbage af ' + todos.length : 'Ingen opgaver endnu.';
}
document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('text');
  todos.push({ text: input.value.trim(), done: false });
  input.value = '';
  save();
});
draw();
`,
  } },
  { id: 'calc', name: 'Lommeregner', icon: '🧮', description: 'Knapper, tal og regnestykker.', files: {
    'index.html': page('Lommeregner', `  <main class="card calc">
    <output id="screen">0</output>
    <div class="keys" id="keys"></div>
  </main>`),
    'style.css': BASE_CSS + `.calc { width: min(340px, 100%); }
#screen { display: block; text-align: right; font-size: 2.2rem; padding: 12px 8px; min-height: 64px; overflow-wrap: anywhere; }
.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.keys button { padding: 16px 0; font-size: 1.2rem; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--text); }
.keys button.op { background: var(--accent); color: #04121f; }
`,
    'app.js': `const screen = document.getElementById('screen');
const keys = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', ',', '⌫', '='];
let expr = '';
for (const k of keys) {
  const b = document.createElement('button');
  b.textContent = k;
  if ('/*-+='.includes(k)) b.className = 'op';
  b.onclick = () => press(k);
  document.getElementById('keys').append(b);
}
function press(k) {
  if (k === 'C') expr = '';
  else if (k === '⌫') expr = expr.slice(0, -1);
  else if (k === '=') {
    try {
      if (!/^[0-9+\\-*/().,\\s]+$/.test(expr)) throw new Error('Ugyldigt regnestykke');
      const v = Function('return (' + expr.replace(/,/g, '.') + ')')();
      expr = String(Math.round(v * 1e10) / 1e10).replace('.', ',');
    } catch (e) { expr = ''; screen.textContent = 'Fejl'; return; }
  } else expr += k;
  screen.textContent = expr || '0';
}
addEventListener('keydown', (e) => { if (/^[0-9+\\-*/(),]$/.test(e.key)) press(e.key); if (e.key === 'Enter') press('='); if (e.key === 'Backspace') press('⌫'); });
`,
  } },
  { id: 'game', name: 'Reaktionsspil', icon: '🎯', description: 'Klik på målet så hurtigt du kan – med rekord.', files: {
    'index.html': page('Reaktionsspil', `  <main class="card">
    <h1>Reaktionsspil</h1>
    <p>Point: <b id="score">0</b> · Tid: <b id="time">20</b> s · Rekord: <b id="best">0</b></p>
    <div id="field"><button id="target" hidden>🎯</button></div>
    <button id="start">Start</button>
  </main>`),
    'style.css': BASE_CSS + `#field { position: relative; height: 260px; border-radius: 14px; margin: 12px 0; background: color-mix(in srgb, var(--accent) 8%, transparent); overflow: hidden; }
#target { position: absolute; width: 54px; height: 54px; padding: 0; border-radius: 50%; font-size: 28px; background: transparent; }
`,
    'app.js': `const field = document.getElementById('field'), target = document.getElementById('target');
let score = 0, left = 0, timer = 0;
document.getElementById('best').textContent = localStorage.getItem('best') || 0;
function move() {
  target.style.left = Math.random() * (field.clientWidth - 54) + 'px';
  target.style.top = Math.random() * (field.clientHeight - 54) + 'px';
}
target.addEventListener('click', () => { score++; document.getElementById('score').textContent = score; move(); });
document.getElementById('start').addEventListener('click', () => {
  score = 0; left = 20; document.getElementById('score').textContent = 0;
  target.hidden = false; move();
  clearInterval(timer);
  timer = setInterval(() => {
    left--; document.getElementById('time').textContent = left;
    if (left <= 0) {
      clearInterval(timer); target.hidden = true;
      const best = Math.max(score, Number(localStorage.getItem('best') || 0));
      localStorage.setItem('best', best);
      document.getElementById('best').textContent = best;
      hubtech.toast('Færdig! Du fik ' + score + ' point.');
    }
  }, 1000);
});
`,
  } },
  { id: 'timer', name: 'Stopur', icon: '⏱️', description: 'Start, stop, omgange.', files: {
    'index.html': page('Stopur', `  <main class="card">
    <h1>Stopur</h1>
    <div id="clock">00:00,00</div>
    <p><button id="go">Start</button> <button id="lap">Omgang</button> <button id="reset">Nulstil</button></p>
    <ol id="laps"></ol>
  </main>`),
    'style.css': BASE_CSS + `#clock { font: 700 3rem ui-monospace, monospace; margin: 8px 0 16px; }
p { display: flex; gap: 8px; flex-wrap: wrap; } ol { padding-left: 22px; color: var(--muted); }
`,
    'app.js': `let start = 0, spent = 0, running = false, raf = 0;
const fmt = (ms) => { const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(c).padStart(2, '0'); };
const now = () => spent + (running ? performance.now() - start : 0);
const tick = () => { document.getElementById('clock').textContent = fmt(now()); if (running) raf = requestAnimationFrame(tick); };
document.getElementById('go').onclick = (e) => {
  if (running) { spent = now(); running = false; e.target.textContent = 'Start'; }
  else { start = performance.now(); running = true; e.target.textContent = 'Stop'; tick(); }
};
document.getElementById('lap').onclick = () => { const li = document.createElement('li'); li.textContent = fmt(now()); document.getElementById('laps').prepend(li); };
document.getElementById('reset').onclick = () => { running = false; spent = 0; cancelAnimationFrame(raf); document.getElementById('go').textContent = 'Start'; document.getElementById('laps').innerHTML = ''; tick(); };
`,
  } },
];
