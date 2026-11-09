// ---- the scripted dive: one unbroken move from orbit to the wave tops ----
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => vmul(a, 1 / vlen(a));
const clamp01 = x => Math.min(1, Math.max(0, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease5 = x => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
// rotate v around unit axis k
const vrot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a); return vadd(vadd(vmul(v, c), vmul(vcross(k, v), s)), vmul(k, vdot(k, v) * (1 - c))); };

// monotone cubic through (xs, ys): no overshoot between keys
function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const TUNE = {
  cine: 24,          // seconds of scripted camera
  // altitude keys: [seconds, km above the sea]
  altKeys: [[0, 1500], [0.7, 1470], [5, 420], [8, 60], [10, 12], [11.5, 5.2], [13.5, 2.4], [16, 0.9], [19, 0.3], [21.5, 0.2], [24, 0.2]],
  alt0: 1500, alt1: 0.2,
  phi0: 1.375, phiPow: 0.6,
  swingFrom: 25, // km: above this the approach curves in from the sun's side
  vEnd: 0.42, tSite: 26,
  pitch0: -70, pitch1: -2.5, pitchPow: 1.6,
  sunElev: 4.0, sunAz: -24,
  mm0: 40, mm1: 22,
};
const altCurve = pchip(TUNE.altKeys.map(k => k[0]), TUNE.altKeys.map(k => Math.log(k[1])));
const SIDE = vcross(HEAD, SITE);                      // right of travel at the site
const SUN = (() => {
  const e = TUNE.sunElev * Math.PI / 180, a = TUNE.sunAz * Math.PI / 180;
  return vnorm(vadd(vadd(vmul(HEAD, Math.cos(e) * Math.cos(a)), vmul(SIDE, Math.cos(e) * Math.sin(a))), vmul(SITE, Math.sin(e))));
})();

function cineAlt(t) {
  return Math.exp(altCurve(t));
}
function cinePos(t) {
  const alt = cineAlt(t);
  // max(0, ..): rounding in the curve can leave alt a hair under alt1, and a negative base would give NaN
  const phi = TUNE.phi0 * Math.pow(Math.max(0, alt - TUNE.alt1) / (TUNE.alt0 - TUNE.alt1), TUNE.phiPow) + TUNE.vEnd * (TUNE.tSite - t) / R;
  // high up, the approach plane is turned toward the sun; it swings onto the final heading on the way down
  const sw = ease5(Math.log(alt / TUNE.swingFrom) / Math.log(TUNE.alt0 / TUNE.swingFrom));
  const head = vrot(HEAD, SITE, -TUNE.sunAz * Math.PI / 180 * sw);
  const up = vadd(vmul(SITE, Math.cos(phi)), vmul(head, -Math.sin(phi)));
  const fwd = vadd(vmul(SITE, Math.sin(phi)), vmul(head, Math.cos(phi)));
  return { alt, up, fwd, pos: vmul(up, R + alt) };
}
// where the dive crosses the cloud deck (top to bottom), as points on the sea-level sphere
const HOLE = [6.6, 1.8].map(alt => {
  let a = 0, b = TUNE.cine;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (cineAlt(m) > alt) a = m; else b = m; }
  return vmul(cinePos(a).up, R);
});
let YAW0 = 0;
YAW0 = (() => { const c = cinePos(0); return -Math.atan2(vdot(SUN, vcross(c.fwd, c.up)), vdot(SUN, c.fwd)); })();
function cineView(t) {
  const c = cinePos(t);
  const s = (Math.log(c.alt) - Math.log(TUNE.alt1)) / (Math.log(TUNE.alt0) - Math.log(TUNE.alt1));
  const pitch = (TUNE.pitch1 + (TUNE.pitch0 - TUNE.pitch1) * Math.pow(clamp01(s), TUNE.pitchPow)) * Math.PI / 180;
  let fwd = vadd(vmul(c.fwd, Math.cos(pitch)), vmul(c.up, Math.sin(pitch)));
  let right = vcross(c.fwd, c.up);
  // open turned toward the sun, then swing onto the approach heading
  const yaw = YAW0 * (1 - ease5((t - 1.5) / 6.5));
  fwd = vrot(fwd, c.up, yaw);
  // a slow bank through the dive, then level out
  const b = Math.sin(Math.PI * clamp01((t - 4) / 11));
  const roll = -0.30 * b * b + 0.004 * Math.sin(t * 1.3) + 0.003 * Math.sin(t * 2.9 + 1);
  // hand-held drift: fractions of a degree
  fwd = vrot(fwd, right, 0.003 * Math.sin(t * 0.9 + 2) + 0.0015 * Math.sin(t * 2.3));
  fwd = vrot(fwd, c.up, 0.003 * Math.sin(t * 0.7) + 0.0015 * Math.sin(t * 1.9 + 4));
  right = vnorm(vcross(fwd, c.up));
  right = vrot(right, fwd, roll);
  const up = vcross(right, fwd);
  const mm = mix(TUNE.mm1, TUNE.mm0, Math.pow(clamp01(s), 0.8));
  return { pos: c.pos, right, up, fwd, tanFov: 12 / mm, sun: SUN, time: t, alt: c.alt };
}

// free camera for look development: position relative to the landing site
function debugView(aheadKm, sideKm, altKm, yawDeg, pitchDeg, mm) {
  const a = aheadKm / R, b = sideKm / R;
  const up = vnorm(vadd(vadd(vmul(SITE, Math.cos(a)), vmul(HEAD, Math.sin(a))), vmul(SIDE, b)));
  let f = vnorm(vsub(HEAD, vmul(up, vdot(HEAD, up))));
  f = vrot(f, up, -yawDeg * Math.PI / 180);
  const r0 = vcross(f, up);
  const fwd = vrot(f, r0, pitchDeg * Math.PI / 180);
  const right = vnorm(vcross(fwd, up));
  return { pos: vmul(up, R + altKm), right, up: vcross(right, fwd), fwd, tanFov: 12 / mm, sun: SUN, time: 20, alt: altKm };
}
