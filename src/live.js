// ---- live: the loop, the controls, and a resolution that follows the frame rate ----
(() => {
  const keys = new Set();
  let t = 0, last = 0, craft = null, simT = 0, manual = false, tookAt = 0, inp = null, stick = null;
  let lastV = null, area = 240000, rw = 0, rh = 0, slow = 0, count = 0, expo = 0, frameNo = 0;

  function fit() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    hud.width = Math.round(innerWidth * d); hud.height = Math.round(innerHeight * d);
    const full = hud.width * hud.height, a = Math.min(area, full, 2.2e6);
    rw = Math.max(64, Math.round(Math.sqrt(a * hud.width / hud.height) / 2) * 2); rh = Math.max(36, Math.round(rw * hud.height / hud.width / 2) * 2);
    canvas.width = rw; canvas.height = rh;
  }
  addEventListener('resize', fit);

  const FLYKEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  const takeOver = () => { if (craft && !manual) { manual = true; tookAt = t; } };
  const skip = () => { if (t > 1 && t < TUNE.cine - 1.5) t = TUNE.cine - 1.2; };
  addEventListener('keydown', e => {
    if (e.code === 'Enter') skip();
    if (e.code === 'KeyR') { t = 0; craft = null; manual = false; }
    if (FLYKEYS.includes(e.code)) { keys.add(e.code); takeOver(); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // drag anywhere = a stick: sideways rolls, pulling down lifts the nose
  addEventListener('pointerdown', e => { skip(); stick = { x0: e.clientX, y0: e.clientY, x: 0, y: 0 }; if (e.pointerType !== 'mouse') takeOver(); });
  addEventListener('pointermove', e => { if (stick) { stick.x = (e.clientX - stick.x0) / 70; stick.y = (e.clientY - stick.y0) / 70; if (Math.abs(stick.x) + Math.abs(stick.y) > 0.3) takeOver(); } });
  addEventListener('pointerup', () => { stick = null; });
  addEventListener('pointercancel', () => { stick = null; });
  const c1 = x => Math.max(-1, Math.min(1, x));
  const has = (...k) => k.some(c => keys.has(c)) ? 1 : 0;
  const player = () => ({
    pitch: c1(has('KeyS', 'ArrowDown') - has('KeyW', 'ArrowUp') + (stick ? stick.y : 0)),
    roll: c1(has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft') + (stick ? stick.x : 0)),
    boost: has('ShiftLeft', 'ShiftRight') - has('Space'),
  });

  function frame(now) {
    requestAnimationFrame(frame);
    if (window.__still) return;
    const real = (now - last) / 1000; last = now;
    const dt = Math.min(0.1, real > 0 ? real : 0.016);
    // resolution chases 30 frames a second: shrink when slower, grow when there is headroom
    if (real > 0 && real < 1) { slow += real; count++; }
    if (count >= 8) {
      const ms = slow / count * 1000; slow = 0; count = 0;
      const next = ms > 38 ? area * Math.max(0.5, 33 / ms) : ms < 24 ? area * 1.18 : area;
      area = Math.max(30000, Math.min(next, hud.width * hud.height, 2.2e6));
      if (Math.abs(area / (rw * rh) - 1) > 0.1) fit();
    }
    t += dt;
    let v;
    if (t < TUNE.cine) v = cineView(t);
    else {
      if (!craft) { craft = flightStart(); simT = TUNE.cine; }
      while (simT < t) { inp = manual ? player() : autopilot(craft, simT - TUNE.cine); flightStep(craft, inp, FLY.dt); simT += FLY.dt; }
      v = flightCam(craft, t, { auto: !manual, tau: t - TUNE.cine, keys: inp, since: manual ? t - tookAt : 0 });
    }
    lastV = v;
    const hdr = renderScene(v, { w: rw, h: rh, frame: frameNo++, ...QUALITY.live });
    const fade = clamp01(t / 0.6);
    // exposure settles over about a third of a second, like an eye
    present(hdr, avg => { const e = autoExposure(avg); expo = expo ? expo + (e - expo) * (1 - Math.exp(-dt * 3)) : e; return expo; }, fade * fade, frameNo % 977);
    drawHud(v, t, hud.width, hud.height, { live: true });
  }
  window.__hold = () => { window.__still = true; DEBUG_VIEW = lastV; return lastV.hud; };
  window.__live = () => ({ t: +t.toFixed(2), rw, rh, manual, area: Math.round(area) });
  if (!Q.has('still')) { fit(); requestAnimationFrame(frame); }
})();
