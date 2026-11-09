// ---- app: quality presets, the frame function, the live loop ----
const Q = new URLSearchParams(location.search);
const QUALITY = {
  live: { steps: 110, shadowSteps: 16, cloudSteps: 28 },
  high: { steps: 260, shadowSteps: 40, cloudSteps: 72 },
  film: { steps: 260, shadowSteps: 40, cloudSteps: 144 },
};

// auto exposure: pull the metered average toward a key, but only part of the way,
// so space stays dark and a sunset stays bright
const EXPO = { key: 0.21, power: 0.8, lo: 0.06, hi: 1.3, avg: 0, value: 1 };
function autoExposure(avg) {
  EXPO.avg = avg;
  EXPO.value = Math.min(EXPO.hi, Math.max(EXPO.lo, EXPO.key / Math.pow(avg, EXPO.power)));
  return EXPO.value;
}

// the camera at time t: scripted first, then the flight model
const FILM = { length: 36, fadeOut: 33.5 };
let DEBUG_VIEW = null;
function viewAt(t) { if (DEBUG_VIEW) return DEBUG_VIEW; return t <= TUNE.cine || !window.flightView ? cineView(Math.min(t, TUNE.cine)) : flightView(t); }

// render one finished frame at time t (seconds). shutter > 0 averages sub-frames across that many seconds.
function drawFrame(t, o = {}) {
  const w = o.w || canvas.width, h = o.h || canvas.height;
  const q = QUALITY[o.quality || 'live'];
  const samples = o.samples || 1, shutter = o.shutter || 0;
  // the film fades up and back down to black; the closing card stays on.
  // The first frame is already half lit: a feed shows it as the still before the video plays.
  const fade = clamp01(0.5 + t / 0.5) * (1 - ease5((t - FILM.fadeOut) / 0.9));
  if (fade > 0) {
    const hdr = renderScene(samples > 1 && shutter > 0 ? s => viewAt(t + (s - 0.5) * shutter) : viewAt(t),
      { w, h, samples, frame: Math.round(t * 60), strips: o.strips, ...q });
    present(hdr, avg => autoExposure(avg) * (o.exposure || 1), fade * fade, (t * 60) % 977);
  } else {
    // fully faded: nothing of the scene shows, so don't render it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  const hw = o.hw || w, hh = o.hh || h;
  hud.width = hw; hud.height = hh;
  if (!DEBUG_VIEW && !o.noHud) drawHud(viewAt(t), t, hw, hh, { dim: 1 - ease5((t - FILM.fadeOut) / 0.9) });
}

// used by the still / capture tools
// hw x hh: size of the HUD layer when the picture is rendered smaller than the page; strips: draw in bands so the desktop stays responsive
window.__shot = (t, w, h, quality, samples, shutter, hw, hh, strips) => {
  window.__still = true;
  canvas.width = w; canvas.height = h;
  const t0 = performance.now();
  drawFrame(t, { w, h, quality, samples, shutter, hw, hh, strips });
  gl.finish();
  // readPixels forces the GPU to really finish before we report a time
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return Math.round(performance.now() - t0);
};
window.__expo = () => EXPO.avg.toFixed(4) + ' -> ' + EXPO.value.toFixed(3);
window.__info = () => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; };
window.__view = (...a) => { window.__still = true; DEBUG_VIEW = a.length ? debugView(...a) : null; };
