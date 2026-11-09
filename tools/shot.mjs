// node tools/shot.mjs <outPrefix> <w> <h> <quality> <samples> <t1> [t2 ...]   -> one PNG per time
import { launch } from './cdp.mjs';
const [prefix, w, h, quality, samples, ...times] = process.argv.slice(2);
const W = +w, H = +h;
const c = await launch({ width: W, height: H });
try {
  await c.open(new URL('../orbit.html', import.meta.url).pathname);
  const errs = c.errors();
  if (errs.length) { console.log('PAGE ERRORS\n' + errs.join('\n')); process.exitCode = 1; }
  else {
    console.log('gpu:', await c.evaluate('__info()'));
    for (const t of times) {
      // "v:ahead,side,alt,yaw,pitch,mm" places a free camera relative to the landing site
      if (t.startsWith('v:')) { await c.evaluate(`__view(${t.slice(2)})`); }
      else await c.evaluate('__view()');
      const ms = await c.evaluate(`__shot(${t.startsWith('v:') ? 20 : +t}, ${W}, ${H}, '${quality}', ${+samples}, 0, ${W}, ${H}, 4)`);
      const file = `${prefix}_${String(t).replace(/[^0-9a-z-]/gi, '_')}.png`;
      await c.screenshot(file, W, H);
      console.log(`t=${t} ${ms} ms expo ${await c.evaluate('__expo()')} -> ${file}`);
    }
    const late = c.errors(); if (late.length) console.log('PAGE ERRORS\n' + late.join('\n'));
  }
} finally { c.close(); }
