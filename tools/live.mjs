// node tools/live.mjs <outPrefix> <w> <h>  -> lets the page run live, presses keys, takes screenshots along the way
import { launch } from './cdp.mjs';
const [prefix, w, h] = process.argv.slice(2);
const W = +w, H = +h, sleep = ms => new Promise(r => setTimeout(r, ms));
const c = await launch({ width: W, height: H });
const key = (type, code, key) => c.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 13 });
const snap = async name => { await c.screenshot(`${prefix}_${name}.png`, W, H); console.log(name, JSON.stringify(await c.evaluate('__live()'))); };
try {
  await c.open(new URL('../orbit.html', import.meta.url).pathname);
  await sleep(4000); await snap('a_dive');
  await key('keyDown', 'Enter', 'Enter'); await key('keyUp', 'Enter', 'Enter');
  await sleep(2500); await snap('b_auto');
  await key('keyDown', 'KeyA', 'a'); await sleep(1500); await snap('c_left');
  await key('keyUp', 'KeyA', 'a'); await key('keyDown', 'KeyS', 's'); await sleep(2500); await snap('d_climb');
  await key('keyUp', 'KeyS', 's'); await sleep(1500); await snap('e_hands_off');
  if (process.argv[5]) {
    const hud = await c.evaluate('JSON.stringify(__hold())'); console.log(hud);
    for (const q of ['live', 'high']) { console.log(q, await c.evaluate(`__shot(20, ${W}, ${H}, '${q}', 1, 0)`), 'ms'); await c.screenshot(`${prefix}_hold_${q}.png`, W, H); }
  }
  const errs = c.errors(); if (errs.length) console.log('PAGE ERRORS\n' + errs.join('\n'));
} finally { c.close(); }
