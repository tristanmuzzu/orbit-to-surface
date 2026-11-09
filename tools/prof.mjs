// node tools/prof.mjs <w> <h> <view...>  -> ms per frame with parts of the renderer switched off
import { launch } from './cdp.mjs';
const [w, h, ...views] = process.argv.slice(2);
const c = await launch({ width: +w, height: +h });
const variants = {
  full: {},
  noTerrain: { steps: 1, shadowSteps: 0 },
  noShadow: { shadowSteps: 0 },
  noCloud: { cloudSteps: 0 },
  atmo4: { atmoSteps: 4 },
  bare: { steps: 1, shadowSteps: 0, cloudSteps: 0, atmoSteps: 2 },
};
try {
  await c.open(new URL('../orbit.html', import.meta.url).pathname);
  const errs = c.errors(); if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
  await c.evaluate(`__shot(1, ${w}, ${h}, 'live', 1, 0)`);
  for (const v of views) {
    const out = [];
    for (const [name, o] of Object.entries(variants)) {
      await c.evaluate(`QUALITY.p = Object.assign({}, QUALITY.live, ${JSON.stringify(o)}); 0`);
      if (v.startsWith('v:')) await c.evaluate(`__view(${v.slice(2)})`); else await c.evaluate('__view()');
      const t = v.startsWith('v:') ? 20 : +v;
      let best = 1e9;
      for (let i = 0; i < 3; i++) best = Math.min(best, await c.evaluate(`__shot(${t}, ${w}, ${h}, 'p', 1, 0)`));
      out.push(`${name} ${best}`);
    }
    console.log(v, '|', out.join(' | '));
  }
} finally { c.close(); }
