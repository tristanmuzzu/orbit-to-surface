// node tools/record.mjs <outDir> <pageW> <pageH> <sceneW> <sceneH> <quality> <samples> <fps> <t0> <t1> [strips] [restMs]
// Renders the film frame by frame: each frame is drawn for its exact time, then screenshotted. Frames already on disk are skipped,
// so a stopped run picks up where it left off.
import fs from 'node:fs';
import { launch } from './cdp.mjs';
const [dir, pw, ph, sw, sh, quality, samples, fps, t0, t1, strips = 1, rest = 0] = process.argv.slice(2);
const PW = +pw, PH = +ph, FPS = +fps, first = Math.round(+t0 * FPS), last = Math.round(+t1 * FPS);
fs.mkdirSync(dir, { recursive: true });
const name = f => `${dir}/f_${String(f).padStart(5, '0')}.png`;
const todo = []; for (let f = first; f < last; f++) if (!fs.existsSync(name(f))) todo.push(f);
console.log(`${todo.length} of ${last - first} frames to render`);
if (todo.length) {
  const c = await launch({ width: PW, height: PH });
  try {
    await c.open(new URL('../orbit.html', import.meta.url).pathname);
    const errs = c.errors(); if (errs.length) throw new Error('page errors\n' + errs.join('\n'));
    const start = Date.now(); let done = 0;
    for (const f of todo) {
      // shutter open for half the frame: enough blur to tie frames together, not enough to smear
      // a frame that takes over a minute is a stalled browser (the machine slept, the GPU reset): fail, and let the caller start again
      const tmp = name(f) + '.part';
      let timer; const stall = new Promise((_, no) => { timer = setTimeout(() => no(new Error('stalled at frame ' + f)), 60000); });
      await Promise.race([stall, (async () => {
        await c.evaluate(`__view(), __shot(${f / FPS}, ${+sw}, ${+sh}, '${quality}', ${+samples}, ${0.5 / FPS}, ${PW}, ${PH}, ${+strips})`);
        await c.screenshot(tmp, PW, PH);
      })()]);
      clearTimeout(timer); fs.renameSync(tmp, name(f));
      if (++done % 30 === 0 || done === todo.length) {
        const per = (Date.now() - start) / done / 1000;
        console.log(`frame ${f} (${done}/${todo.length}) ${per.toFixed(2)} s each, about ${Math.round(per * (todo.length - done) / 60)} min left`);
      }
      if (+rest) await new Promise(r => setTimeout(r, +rest));
    }
    const late = c.errors(); if (late.length) console.log('PAGE ERRORS\n' + late.join('\n'));
  } finally { c.close(); }
}
