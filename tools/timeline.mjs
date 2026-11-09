// print altitude, distance to the site and sun elevation along the scripted path
import fs from 'node:fs'; import vm from 'node:vm';
const ctx = {}; vm.createContext(ctx);
const s = f => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
vm.runInContext(s('terrain.js') + s('site.js') + s('path.js') + ';this.api={cineView,cinePos,SUN,TUNE,terrain,vdot,vnorm,vsub,vlen}', ctx);
const { cineView, cinePos, SUN, TUNE, terrain, vdot, vnorm, vsub, vlen } = ctx.api;
for (let t = 0; t <= TUNE.cine + 0.01; t += +(process.argv[2] || 2)) {
  const v = cineView(t), up = vnorm(v.pos);
  const sp = vlen(vsub(cinePos(t + 0.01).pos, cinePos(t - 0.01).pos)) / 0.02;
  const pitch = Math.asin(vdot(v.fwd, up)) * 57.3, sunEl = Math.asin(vdot(SUN, up)) * 57.3;
  const sunView = Math.acos(vdot(SUN, v.fwd)) * 57.3;
  console.log(`t=${t.toFixed(1)} alt=${v.alt.toFixed(2)} ground=${terrain(v.pos).toFixed(2)} speed=${sp.toFixed(2)}km/s pitch=${pitch.toFixed(0)} sunElev=${sunEl.toFixed(0)} sunOffAxis=${sunView.toFixed(0)} vfov=${(2 * Math.atan(v.tanFov) * 57.3).toFixed(0)}`);
}
