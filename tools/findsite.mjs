// Search the planet for a landing approach: open sea behind and toward the sun, a mountain coast ahead on the right.
// Works backwards from peaks near a shore, so most tries are near misses rather than open ocean.
import fs from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const terrain = new Function(fs.readFileSync(new URL('terrain.js', dir), 'utf8') + '\nreturn terrain;')();
const SUN_AZ = -24;   // degrees, negative = left of the heading (keep in step with TUNE.sunAz)

let seed = +(process.argv[3] || 12345);
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// point km away from S in the direction az degrees right of H
const at = (S, H, km, az = 0) => {
  const side = cross(H, S), a = az * Math.PI / 180, d = km / 600;
  return norm([0, 1, 2].map(i => S[i] * Math.cos(d) + (H[i] * Math.cos(a) + side[i] * Math.sin(a)) * Math.sin(d)));
};

const t0 = Date.now();
const peaks = [];
for (let n = 0; n < 4000000 && peaks.length < 6000 && Date.now() - t0 < 60000; n++) {
  const P = norm([rnd() * 2 - 1, (rnd() * 2 - 1) * 0.45, rnd() * 2 - 1]);
  if (terrain(P, 3) < 1.6) continue;
  if (terrain(P, 8) > 2.8) peaks.push(P);
}
console.log('peaks', peaks.length, 'in', Date.now() - t0, 'ms');

const found = [], fail = [0, 0, 0, 0, 0, 0];
for (const P of peaks) {
  if (Date.now() - t0 > 240000) break;
  for (let k = 0; k < 120; k++) {
    const r = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    const B = norm(cross(P, r));                       // random bearing away from the peak
    const S = at(P, B, 8 + rnd() * 10);
    if (terrain(S, 4) > -0.15) { fail[0]++; continue; }
    // heading: the peak sits 30..75 degrees to the right
    let toP = [0, 1, 2].map(i => P[i] - S[i] * dot(P, S)); toP = norm(toP);
    const az = (30 + rnd() * 45) * Math.PI / 180, left = cross(S, toP);
    const H = norm([0, 1, 2].map(i => toP[i] * Math.cos(az) + left[i] * Math.sin(az)));
    let ok = true;
    for (let km = -70; km <= 4 && ok; km += 6) if (terrain(at(S, H, km), 6) > -0.02) ok = false;
    if (!ok) { fail[1]++; continue; }
    for (let km = 4; km <= 90 && ok; km += 4) for (const da of [-10, 0, 10]) if (terrain(at(S, H, km, SUN_AZ + da), 6) > -0.01) { ok = false; break; }
    if (!ok) { fail[2]++; continue; }
    for (let km = 0; km <= 14 && ok; km += 1) if (terrain(at(S, H, km), 8) > 0.05) ok = false;
    if (!ok) { fail[3]++; continue; }
    let coast = 99, peak = 0, sum = 0, cnt = 0, near = 0;
    for (let a = 15; a <= 100; a += 8.5) for (let km = 3; km <= 34; km += 1.5) {
      const h = terrain(at(S, H, km, a), 8);
      if (h > 0 && km < coast) coast = km;
      peak = Math.max(peak, h); sum += Math.max(h, 0); cnt++;
      if (km < 18) near = Math.max(near, h);
    }
    if (coast < 3.5 || coast > 12 || near < 2.0) { fail[4]++; continue; }
    found.push({ S, H, coast, peak, near, score: peak + near + 2 * sum / cnt });
  }
}
console.log('fails [land, behind, sunward, ahead, mountains]', fail.join(' '));
console.log('candidates', found.length, 'in', Date.now() - t0, 'ms');
found.sort((a, b) => b.score - a.score);
for (const f of found.slice(0, 8)) console.log(f.score.toFixed(2), 'peak', f.peak.toFixed(2), 'near', f.near.toFixed(2), 'coast', f.coast, JSON.stringify(f.S.map(x => +x.toFixed(6))), JSON.stringify(f.H.map(x => +x.toFixed(6))));
const pick = found[+(process.argv[2] || 0)];
if (pick) {
  fs.writeFileSync(new URL('site.js', dir), `// landing site, chosen by tools/findsite.mjs\nconst SITE = ${JSON.stringify(pick.S)};\nconst HEAD = ${JSON.stringify(pick.H)};\n`);
  console.log('wrote site.js with candidate', +(process.argv[2] || 0), 'of', found.length);
} else console.log('no site found');
