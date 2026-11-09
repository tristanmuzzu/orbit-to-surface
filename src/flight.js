// ---- flight: the dive hands over to this at TUNE.cine. Same model for the autopilot and the player. ----
const FILE_KB = /*__KB__*/0;
const FLY = {
  base: 0.40, boost: 0.80, slow: 0.16,   // km/s at sea level; scaled up with altitude so high flight still moves
  rollRate: 1.9, pitchRate: 0.62, turn: 0.42, maxBank: 1.25,
  floor: 0.035, dt: 1 / 120,
};
const NORTH = [0, 1, 0];
const ground = p => Math.max(0, terrain(p, 9));

// camera frame for a craft at pos, flying along fwd, banked by `bank` radians (right wing down = positive)
function frameOf(pos, fwd, bank) {
  const up0 = vnorm(pos);
  const rh = vnorm(vcross(fwd, up0));
  const lift = vcross(rh, fwd);
  const right = vadd(vmul(rh, Math.cos(bank)), vmul(lift, -Math.sin(bank)));
  return { up0, rh, right, up: vcross(right, fwd) };
}

// the highest summit in the right-hand sector of the landing site: where the autopilot turns to
const PEAK = (() => {
  let best = -1, at = SITE;
  for (let i = 0; i < 48; i++) for (let j = 0; j < 40; j++) {
    const az = (20 + 70 * i / 47) * Math.PI / 180, d = (5 + 22 * j / 39) / R;
    const dir = vadd(vmul(HEAD, Math.cos(az)), vmul(SIDE, Math.sin(az)));
    const p = vadd(vmul(SITE, Math.cos(d)), vmul(dir, Math.sin(d)));
    const h = terrain(p, 6);
    if (h > best) { best = h; at = p; }
  }
  return vnorm(at);
})();

function flightStart() {
  const v = cineView(TUNE.cine), f = frameOf(v.pos, v.fwd, 0);
  return {
    pos: v.pos, fwd: v.fwd, bank: Math.atan2(-vdot(v.right, vcross(f.rh, v.fwd)), vdot(v.right, f.rh)),
    speed: FLY.base * (1 + TUNE.alt1 / 4), thr: 0, pull: 0, in: { pitch: 0, roll: 0, boost: 0 },
  };
}

// what the autopilot wants at tau seconds after the handover: bank toward the summit, hold height, then light the burner
function autopilot(s, tau) {
  const f = frameOf(s.pos, s.fwd, 0);
  const to = vsub(PEAK, vmul(f.up0, vdot(PEAK, f.up0)));
  const flat = vnorm(vsub(s.fwd, vmul(f.up0, vdot(s.fwd, f.up0))));
  // aim a little left of the summit so it sits right of centre
  const bearing = Math.atan2(vdot(to, f.rh), vdot(to, flat)) - 0.36;
  const wantBank = tau < 1.3 ? 0 : Math.max(-0.72, Math.min(0.72, bearing * 2.0));
  const alt = vlen(s.pos) - R, wantAlt = 0.2 + 0.05 * clamp01((tau - 6) / 4);
  const wantPitch = Math.max(-0.08, Math.min(0.12, (wantAlt - alt) * 1.6));
  const pitch = Math.asin(vdot(s.fwd, f.up0));
  return {
    roll: Math.max(-0.42, Math.min(0.42, (wantBank - s.bank) * 1.8)),
    // pull a little while banked: the turn tightens and the nose stays up
    pitch: Math.max(-1, Math.min(1, (wantPitch - pitch) * 4 + 0.35 * Math.abs(Math.sin(s.bank)))),
    boost: tau > 6.2 ? 1 : 0,
  };
}

// advance the craft by dt with stick input (pitch, roll in [-1,1], boost in [-1,1])
function flightStep(s, inp, dt) {
  const f0 = frameOf(s.pos, s.fwd, s.bank);
  // stick response is smoothed, so key taps do not snap the horizon
  const k = 1 - Math.exp(-dt * 7);
  s.in.pitch += (inp.pitch - s.in.pitch) * k; s.in.roll += (inp.roll - s.in.roll) * k; s.in.boost += (inp.boost - s.in.boost) * (1 - Math.exp(-dt * 1.6));
  s.bank += s.in.roll * FLY.rollRate * dt;
  // hands off: the wings level themselves
  if (Math.abs(inp.roll) < 0.05) s.bank *= Math.exp(-dt * 0.9);
  s.bank = Math.max(-FLY.maxBank, Math.min(FLY.maxBank, s.bank));
  let fwd = vrot(s.fwd, f0.right, s.in.pitch * FLY.pitchRate * dt);
  fwd = vrot(fwd, f0.up0, -Math.sin(s.bank) * FLY.turn * dt);
  // terrain assist: look ahead and lift the nose before the ground arrives
  const alt = vlen(s.pos) - R, climb = vdot(fwd, f0.up0);
  let need = 0;
  for (const look of [0.5, 1.4, 3.2]) {
    const d = s.speed * look, g = ground(vadd(s.pos, vmul(fwd, d)));
    need = Math.max(need, (g + FLY.floor + 0.02 * look - (alt + climb * d)) / d);
  }
  s.pull += ((need > 0 ? 1 : 0) - s.pull) * (1 - Math.exp(-dt * 5));
  if (need > 0) fwd = vrot(fwd, f0.rh, Math.min(1.4, need * 5) * dt);
  // stay inside the air
  if (alt > 45 && climb > 0) fwd = vrot(fwd, f0.rh, -climb * 2 * dt);
  // the nose stops at 62 degrees up or down, so there is always a horizon to fly by
  const c = vdot(fwd, f0.up0);
  if (Math.abs(c) > 0.88) fwd = vadd(vmul(vnorm(vsub(fwd, vmul(f0.up0, c))), 0.475), vmul(f0.up0, 0.88 * Math.sign(c)));
  s.fwd = vnorm(fwd);
  const want = (s.in.boost >= 0 ? mix(FLY.base, FLY.boost, s.in.boost) : mix(FLY.base, FLY.slow, -s.in.boost)) * (1 + Math.max(0, alt) / 4);
  s.speed += (want - s.speed) * (1 - Math.exp(-dt * 2.2));
  s.thr = s.in.boost;
  let pos = vadd(s.pos, vmul(s.fwd, s.speed * dt));
  const g = ground(pos), a = vlen(pos) - R;
  if (a < g + 0.012) {
    pos = vmul(vnorm(pos), R + g + 0.012);
    const u = vnorm(pos), c = vdot(s.fwd, u);
    if (c < 0.02) s.fwd = vnorm(vadd(s.fwd, vmul(u, 0.02 - c)));
  }
  s.pos = pos;
  return s;
}

function flightCam(s, t, extra) {
  const f = frameOf(s.pos, s.fwd, s.bank);
  const up0 = f.up0, alt = vlen(s.pos) - R;
  const flat = vnorm(vsub(s.fwd, vmul(up0, vdot(s.fwd, up0))));
  const north = vnorm(vsub(NORTH, vmul(up0, vdot(NORTH, up0)))), east = vcross(NORTH, up0);
  // the lens opens up with the burner
  const mm = TUNE.mm1 - 3.5 * Math.max(0, s.thr);
  return {
    pos: s.pos, right: f.right, up: f.up, fwd: s.fwd, tanFov: 12 / mm, sun: SUN, time: t, alt,
    hud: {
      alt, agl: alt - ground(s.pos), speed: s.speed, bank: s.bank, pitch: Math.asin(vdot(s.fwd, up0)),
      heading: (Math.atan2(vdot(flat, east), vdot(flat, north)) * 180 / Math.PI + 360) % 360,
      in: { ...s.in }, pull: s.pull, ...extra,
    },
  };
}

// the autopilot's run is simulated once at a fixed step, so any frame of the film can be drawn on its own
const AUTO = (() => {
  const run = [], s = flightStart();
  for (let i = 0; i <= 14 / FLY.dt; i++) {
    const inp = autopilot(s, i * FLY.dt);
    run.push({ pos: s.pos, fwd: s.fwd, bank: s.bank, speed: s.speed, thr: s.thr, pull: s.pull, in: { ...s.in }, want: inp });
    flightStep(s, inp, FLY.dt);
  }
  return run;
})();

function flightView(t) {
  const x = Math.min(AUTO.length - 1.001, Math.max(0, (t - TUNE.cine) / FLY.dt)), i = Math.floor(x), k = x - i;
  const a = AUTO[i], b = AUTO[i + 1], l = (p, q) => mix(p, q, k);
  const s = {
    pos: vadd(vmul(a.pos, 1 - k), vmul(b.pos, k)), fwd: vnorm(vadd(vmul(a.fwd, 1 - k), vmul(b.fwd, k))),
    bank: l(a.bank, b.bank), speed: l(a.speed, b.speed), thr: l(a.thr, b.thr), pull: l(a.pull, b.pull),
    in: { pitch: l(a.in.pitch, b.in.pitch), roll: l(a.in.roll, b.in.roll), boost: l(a.in.boost, b.in.boost) },
  };
  return flightCam(s, t, { auto: true, tau: t - TUNE.cine, keys: a.want });
}

// telemetry for the dive, so the altitude ribbon can run from the first frame
function cineHud(t) {
  const c = cinePos(t), d = cinePos(t + 0.02);
  return { alt: c.alt, speed: vlen(vsub(d.pos, c.pos)) / 0.02, cine: true, tau: t - TUNE.cine };
}
