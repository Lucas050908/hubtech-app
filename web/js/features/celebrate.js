/** A small burst of confetti from an element (or the middle of the screen). Skipped when reduced motion is preferred. */
const COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#4ade80', '#fb923c'];

export function celebrate(from, { count = 26, spread = 1 } = {}) {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch { /* */ }
  let x = innerWidth / 2, y = innerHeight / 3;
  if (from?.getBoundingClientRect) { const r = from.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  const box = document.createElement('div');
  box.className = 'cf-box';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const a = (Math.random() * Math.PI) + Math.PI, d = (60 + Math.random() * 120) * spread;
    p.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i % COLORS.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${Math.random() * 60}ms;${Math.random() < 0.4 ? 'border-radius:50%;' : ''}`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1400);
}
