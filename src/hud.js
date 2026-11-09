// ---- HUD: lines and a stroke alphabet drawn by hand below. No fonts are loaded. ----
const hud = document.getElementById('hud'), hx = hud.getContext('2d');
let DIM = 1;   // the instruments fade with the picture at the end of the film; the closing card does not
const INK = a => `rgba(244,238,226,${a * DIM})`, AMBER = a => `rgba(255,190,104,${a * DIM})`;
const CREDIT = 'WRITTEN BY CLAUDE FABLE 5.2';
// each glyph: strokes of xy pairs on a 5 x 7 grid (x 0-4, y 0-6 up from the baseline); a lone pair is a dot
const GLYPHS = {
  0: '103041453616050110', 1: '152620 1030', 2: '05163645440040', 3: '064623334241301001', 4: '30360242',
  5: '460603334241301001', 6: '36160501103041423303', 7: '064610', 8: '13040516364544331302011030414233',
  9: '43130405163645413010', A: '0004264440 0242', B: '00063645443303 3342413000', C: '4536160501103041',
  D: '00063645413000', E: '40000646 0333', F: '000646 0333', G: '45361605011030414323', H: '0006 4046 0343',
  I: '2026 1030 1636', J: '4641301001', K: '0006 460340', L: '060040', M: '0006234640', N: '00064046',
  O: '103041453616050110', P: '00063645443303', Q: '103041453616050110 2240', R: '00063645443303 2340',
  S: '453616050413334241301001', T: '0646 2620', U: '060110304146', V: '062046', W: '0610233046', X: '0046 0640',
  Y: '062346 2320', Z: '06460040', '-': '1333', '/': '0046', '+': '1333 2224', '.': '10', '·': '13', ':': '11 14',
};
const NARROW = ' .·:';
const adv = c => NARROW.includes(c) ? 3.6 : 6.3;
function textWidth(str, cap) { let w = 0; for (const c of str) w += adv(c); return (w - 2.3) * cap / 6; }
// draw str with its baseline at y; align 0 = left, 0.5 = centred, 1 = right
function text(str, x, y, cap, align, color, weight = 1) {
  const k = cap / 6;
  x -= textWidth(str, cap) * align;
  const lw = Math.max(1, cap / 8.5) * weight, dots = [];
  hx.beginPath();
  for (const c of str) {
    for (const s of (GLYPHS[c] || '').split(' ')) {
      if (s.length === 2) dots.push(x + s[0] * k, y - s[1] * k);
      else for (let i = 0; i < s.length; i += 2) hx[i ? 'lineTo' : 'moveTo'](x + s[i] * k, y - s[i + 1] * k);
    }
    x += adv(c) * k;
  }
  hx.strokeStyle = color; hx.lineWidth = lw; hx.stroke();
  hx.fillStyle = color; hx.beginPath();
  for (let i = 0; i < dots.length; i += 2) { hx.moveTo(dots[i], dots[i + 1]); hx.arc(dots[i], dots[i + 1] - lw * 0.4, lw * 0.95, 0, 7); }
  hx.fill();
}
function line(x0, y0, x1, y1, color, w) { hx.beginPath(); hx.moveTo(x0, y0); hx.lineTo(x1, y1); hx.strokeStyle = color; hx.lineWidth = w; hx.stroke(); }
const altText = a => a >= 100 ? Math.round(a) + ' KM' : a >= 10 ? a.toFixed(1) + ' KM' : a >= 1 ? a.toFixed(2) + ' KM' : Math.round(a * 1000) + ' M';

function drawHud(v, t, W, H, o = {}) {
  hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, W, H);
  const h = v.hud || cineHud(t), u = Math.min(H / 720, W / 900), cx = W / 2, cy = H / 2;
  hx.lineCap = hx.lineJoin = 'round'; DIM = o.dim == null ? 1 : o.dim;
  hx.shadowColor = 'rgba(0,0,0,0.75)'; hx.shadowBlur = 5 * u;
  const on = (delay, dur = 0.7) => h.cine ? 0 : o.live && !h.auto ? 1 : ease5((h.tau - delay) / dur);

  // -- altitude ribbon: orbit to sea level on one log scale, present for the whole film --
  const A0 = clamp01((t - 2.6) / 1.4) * (1 - 0.5 * clamp01((h.tau - 6.4) / 0.8) * (h.auto ? 1 : 0));
  if (A0 > 0) {
    const x = W - 44 * u, top = 150 * u, bot = 570 * u;
    const ya = a => bot - Math.log10(Math.max(a, 0.05) / 0.05) / 4.6 * (bot - top);
    const ym = ya(h.alt);
    line(x, top, x, bot, INK(0.42 * A0), u);
    // the cloud deck, as a heavier stretch of the scale
    line(x, ya(5.6), x, ya(2.4), INK(0.55 * A0), 3.2 * u);
    for (const a of [0.1, 1, 10, 100, 1000]) {
      const y = ya(a), near = 1 - clamp01(1.6 - Math.abs(y - ym) / (16 * u));
      line(x - 7 * u, y, x, y, INK(0.6 * A0), u);
      text(String(a), x - 13 * u, y + 3.5 * u, 7 * u, 1, INK(0.5 * A0 * near));
    }
    text('KM', x, top - 12 * u, 7 * u, 0.5, INK(0.5 * A0));
    hx.beginPath(); hx.moveTo(x - 3 * u, ym); hx.lineTo(x - 13 * u, ym - 5.5 * u); hx.lineTo(x - 13 * u, ym + 5.5 * u); hx.closePath();
    hx.fillStyle = AMBER(0.95 * A0); hx.fill();
    text(altText(h.alt), x - 22 * u, ym + 7.5 * u, 15 * u, 1, INK(0.95 * A0));
  }
  if (o.live && h.cine && t > 1.2) text('ENTER OR TAP · SKIP THE DIVE', 40 * u, H - 40 * u, 7.5 * u, 0, INK(0.5 * clamp01(t - 1.2)));
  if (h.cine) return;

  // -- horizon and pitch ladder, true to the lens: the line sits on the real horizon --
  const ppr = H / 2 / v.tanFov, RAD = Math.PI / 180;
  let A = on(0.15);
  const dip = Math.acos(R / (R + Math.max(0, h.alt)));   // the sea horizon sits this far below level
  hx.save(); hx.translate(cx, cy); hx.rotate(-h.bank);
  for (let d = -85; d <= 85; d += 5) {
    const off = Math.tan(d * RAD - (d ? 0 : dip) - h.pitch) * ppr;
    if (Math.abs(d * RAD - h.pitch) > 0.6 || Math.abs(off) > 215 * u) continue;
    const a = A * (1 - clamp01((Math.abs(off) - 120 * u) / (95 * u))) * (d ? 0.72 : 0.9);
    const a0 = (d ? 54 : 70) * u, a1 = a0 + (d ? 44 : 250 * on(0.15, 1.1)) * u;
    hx.setLineDash(d < 0 ? [5 * u, 5 * u] : []);
    for (const s of [-1, 1]) {
      line(s * a0, -off, s * a1, -off, INK(a), (d ? 1.1 : 1.4) * u);
      if (d) line(s * a0, -off, s * a0, -off + Math.sign(d) * 5 * u, INK(a), 1.1 * u);
    }
    hx.setLineDash([]);
    if (d) for (const s of [-1, 1]) text(String(Math.abs(d)), s * (a1 + 13 * u), -off + 4 * u, 8 * u, 0.5, INK(a));
  }
  hx.restore();
  // where the nose points
  A = on(0);
  hx.beginPath(); hx.arc(cx, cy, 6.5 * u, 0, 7);
  for (const s of [-1, 1]) { hx.moveTo(cx + s * 6.5 * u, cy); hx.lineTo(cx + s * (6.5 + 17 * A) * u, cy); }
  hx.moveTo(cx, cy - 6.5 * u); hx.lineTo(cx, cy - 12.5 * u);
  hx.strokeStyle = AMBER(A); hx.lineWidth = 1.7 * u; hx.stroke();
  if (h.pull > 0.25) text('TERRAIN', cx, cy + 64 * u, 9 * u, 0.5, AMBER(clamp01(h.pull * 2 - 0.5)));

  // -- heading tape --
  A = on(0.3);
  const hy = 58 * u, span = 38, step = 4.4 * u;
  for (let d = Math.ceil((h.heading - span) / 5) * 5; d <= h.heading + span; d += 5) {
    const e = (d - h.heading) / span, a = A * (1 - e * e) * 0.75, x = cx + (d - h.heading) * step, dd = (d + 360) % 360;
    line(x, hy, x, hy + (dd % 15 ? 5 : 9) * u, INK(a), 1.1 * u);
    if (dd % 30 === 0) text({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] || String(dd / 10).padStart(2, '0'), x, hy - 7 * u, 8 * u, 0.5, INK(a));
  }
  hx.beginPath(); hx.moveTo(cx, hy + 13 * u); hx.lineTo(cx - 5 * u, hy + 21 * u); hx.lineTo(cx + 5 * u, hy + 21 * u); hx.closePath();
  hx.fillStyle = AMBER(A); hx.fill();

  // -- speed --
  A = on(0.4);
  const sx = Math.max(cx - 300 * u, 150 * u);
  text(String(Math.round(h.speed * 1000)), sx, cy + 11 * u, 22 * u, 1, INK(0.95 * A));
  text('M/S', sx, cy + 30 * u, 7.5 * u, 1, INK(0.55 * A));
  if (h.in.boost > 0.08) line(sx - 62 * u, cy + 42 * u, sx - 62 * u + 62 * u * clamp01(h.in.boost), cy + 42 * u, AMBER(0.9 * A), 2 * u);

  // -- the keys: lit by whoever is flying, autopilot or player --
  A = on(0.6) * (h.auto ? 1 - clamp01((h.tau - 6.2) / 0.6) * (o.live ? 0 : 1) : 1 - 0.55 * clamp01(((h.since || 0) - 7) / 2));
  const k = h.keys || h.in, bx = 44 * u, by = H - 44 * u, cs = 22 * u;
  const key = (x, y, w, label, lit) => {
    hx.beginPath(); hx.roundRect ? hx.roundRect(x, y - cs, w, cs, 4 * u) : hx.rect(x, y - cs, w, cs);
    if (lit) { hx.fillStyle = INK(0.92 * A); hx.fill(); } else { hx.fillStyle = `rgba(12,14,22,${0.4 * A * DIM})`; hx.fill(); hx.strokeStyle = INK(0.75 * A); hx.lineWidth = 1.2 * u; hx.stroke(); }
    hx.save(); if (lit) hx.shadowColor = 'transparent';
    text(label, x + w / 2, y - cs / 2 + 4 * u, 8 * u, 0.5, lit ? `rgba(22,26,34,${A * DIM})` : INK(0.85 * A));
    hx.restore();
  };
  if (A > 0.01) {
    // a soft shade behind the corner, so the keys read over a bright sky
    const g = hx.createRadialGradient(bx + 80 * u, by - 22 * u, 8 * u, bx + 80 * u, by - 22 * u, 210 * u);
    g.addColorStop(0, `rgba(8,10,18,${0.36 * A * DIM})`); g.addColorStop(1, 'rgba(8,10,18,0)');
    hx.save(); hx.shadowColor = 'transparent'; hx.fillStyle = g; hx.fillRect(0, by - 240 * u, bx + 300 * u, 300 * u); hx.restore();
    key(bx + 26 * u, by - 26 * u, cs, 'W', k.pitch < -0.25); key(bx, by, cs, 'A', k.roll < -0.25);
    key(bx + 26 * u, by, cs, 'S', k.pitch > 0.25); key(bx + 52 * u, by, cs, 'D', k.roll > 0.25);
    key(bx + 88 * u, by, 58 * u, 'SHIFT', k.boost > 0.5);
    if (h.auto) { text('AUTOPILOT', bx + 88 * u, by - 39 * u, 8.5 * u, 0, AMBER(A)); text('PRESS ANY KEY TO FLY', bx + 88 * u, by - 28 * u + 0.5 * u, 6.5 * u, 0, INK(0.8 * A)); }
    else text('W S PITCH · A D ROLL · SHIFT BOOST · SPACE SLOW · R RESTART', bx + 160 * u, by - 7 * u, 6.5 * u, 0, INK(0.5 * A * (1 - clamp01(((h.since || 0) - 7) / 2))));
  }

  // -- closing card, while the autopilot still has it --
  DIM = 1;
  if (h.auto && h.tau > 6.6) {
    const c = i => ease5((h.tau - 6.8 - i * 0.22) / 0.7), y = mix(H - 104 * u, H / 2 - 8 * u, ease5(1 - (o.dim == null ? 1 : o.dim)));
    text('ONE HTML FILE · ' + FILE_KB + ' KB', cx, y - 6 * u * (1 - c(0)), 21 * u, 0.5, INK(c(0)), 1.15);
    text('NO TEXTURES · NO MODELS · NO LIBRARIES', cx, y + 26 * u, 10.5 * u, 0.5, INK(0.85 * c(1)));
    text(CREDIT, cx, y + 47 * u, 8 * u, 0.5, AMBER(0.95 * c(2)));
  }
}
