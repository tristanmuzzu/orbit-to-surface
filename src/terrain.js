// ---- the same height field as the shader, in JS, so the camera can feel the ground ----
const R = 600;
function hu(x, y, z) {
  x = Math.imul(x, 1597334673); y = Math.imul(y, 3812015801); z = Math.imul(z, 2798796415);
  let h = (x ^ y ^ z) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
const h1 = (x, y, z) => (hu(x, y, z) >>> 8) / 16777216;
const q5 = f => f * f * f * (f * (f * 6 - 15) + 10);

// returns [value, dx, dy, dz], value in [-1,1]
function noised(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = q5(fx), uy = q5(fy), uz = q5(fz);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1), duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const a = h1(ix, iy, iz), b = h1(ix + 1, iy, iz), c = h1(ix, iy + 1, iz), d = h1(ix + 1, iy + 1, iz);
  const e = h1(ix, iy, iz + 1), g = h1(ix + 1, iy, iz + 1), h = h1(ix, iy + 1, iz + 1), k = h1(ix + 1, iy + 1, iz + 1);
  const k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - h + k;
  return [
    -1 + 2 * (a + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz),
    2 * dux * (k1 + k4 * uy + k6 * uz + k7 * uy * uz),
    2 * duy * (k2 + k5 * uz + k4 * ux + k7 * uz * ux),
    2 * duz * (k3 + k6 * ux + k5 * uy + k7 * ux * uy)];
}
const noise = (x, y, z) => noised(x, y, z)[0];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function continent(qx, qy, qz) {
  let sx = qx / 300 + 3.1, sy = qy / 300 + 7.7, sz = qz / 300 + 1.3, c = 0, a = 0.5;
  for (let i = 0; i < 5; i++) {
    c += a * noise(sx, sy, sz);
    const nx = (-0.8 * sy - 0.6 * sz) * 2.02, ny = (0.8 * sx + 0.36 * sy - 0.48 * sz) * 2.02, nz = (0.6 * sx - 0.48 * sy + 0.64 * sz) * 2.02;
    sx = nx; sy = ny; sz = nz; a *= 0.5;
  }
  return c + 0.04;
}

// height above sea level (km) under the direction p (any length)
function terrain(p, oct = 10) {
  const l = Math.hypot(p[0], p[1], p[2]), qx = p[0] / l * R, qy = p[1] / l * R, qz = p[2] / l * R;
  const c = continent(qx, qy, qz);
  const base = c > 0 ? c * 1.5 : c * 5;
  if (c < -0.12) return base;
  const land = sstep(-0.12, 0.10, c);
  const mm = sstep(-0.25, 0.45, noise(qx / 110 + 40, qy / 110 + 40, qz / 110 + 40));
  const mount = sstep(-0.03, 0.07, c) * mm * mm;
  let sx = qx / 16, sy = qy / 16, sz = qz / 16, a = 0, b = 1, dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < 14; i++) {
    const w = Math.min(1, Math.max(0, oct - i));
    if (w <= 0) break;
    const n = noised(sx, sy, sz);
    const sa = Math.sqrt(n[0] * n[0] + 0.012), rg = 1 - sa, sm = 0.5 + 0.5 * n[0];
    const k = w * 0.6 * (0.5 + (-2 * rg * n[0] / sa - 0.5) * 0.7);
    dx += n[1] * k; dy += n[2] * k; dz += n[3] * k;
    a += w * b * (sm + (rg * rg - sm) * 0.7) / (1 + dx * dx + dy * dy + dz * dz);
    b *= 0.5;
    const nx = (-0.8 * sy - 0.6 * sz) * 2, ny = (0.8 * sx + 0.36 * sy - 0.48 * sz) * 2, nz = (0.6 * sx - 0.48 * sy + 0.64 * sz) * 2;
    sx = nx; sy = ny; sz = nz;
  }
  return base + land * ((0.25 + 4.6 * mount) * a - 0.2);
}
