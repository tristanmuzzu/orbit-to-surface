// ---- shared constants, noise and the planet's height field (km units) ----
const float R    = 600.0;   // sea-level radius
const float RA   = 680.0;   // top of atmosphere
const float HMAX = 7.0;     // no terrain above this
const float CLO  = 2.4;     // cloud shell, above sea level
const float CHI  = 5.6;
const float PI   = 3.14159265;
const mat3  M3   = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

uint hu(uvec3 x) {
  x *= uvec3(1597334673u, 3812015801u, 2798796415u);
  uint h = x.x ^ x.y ^ x.z;
  h ^= h >> 15; h *= 2246822519u;
  h ^= h >> 13; h *= 3266489917u;
  h ^= h >> 16;
  return h;
}
float h1(ivec3 p) { return float(hu(uvec3(p)) >> 8) * (1.0 / 16777216.0); }

// value noise in [-1,1]
float noise(vec3 x) {
  vec3 i = floor(x), f = x - i; ivec3 p = ivec3(i);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = h1(p), b = h1(p + ivec3(1,0,0)), c = h1(p + ivec3(0,1,0)), d = h1(p + ivec3(1,1,0));
  float e = h1(p + ivec3(0,0,1)), g = h1(p + ivec3(1,0,1)), h = h1(p + ivec3(0,1,1)), k = h1(p + ivec3(1,1,1));
  return -1.0 + 2.0 * mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

// value noise in [-1,1] with analytic gradient in yzw
vec4 noised(vec3 x) {
  vec3 i = floor(x), f = x - i; ivec3 p = ivec3(i);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = h1(p), b = h1(p + ivec3(1,0,0)), c = h1(p + ivec3(0,1,0)), d = h1(p + ivec3(1,1,0));
  float e = h1(p + ivec3(0,0,1)), g = h1(p + ivec3(1,0,1)), h = h1(p + ivec3(0,1,1)), k = h1(p + ivec3(1,1,1));
  float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a;
  float k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - h + k;
  return vec4(
    -1.0 + 2.0 * (k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z),
    2.0 * du * vec3(k1 + k4*u.y + k6*u.z + k7*u.y*u.z,
                    k2 + k5*u.z + k4*u.x + k7*u.z*u.x,
                    k3 + k6*u.x + k5*u.y + k7*u.x*u.y));
}

const float MTN = 4.6, DAMP = 0.6, RIDGE = 0.7;   // mountain height (km), how strongly slopes mute finer detail
// continents: > 0 is land. q is a point on the sea-level sphere.
float continent(vec3 q) {
  vec3 s = q * (1.0 / 300.0) + vec3(3.1, 7.7, 1.3);
  float c = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { c += a * noise(s); s = M3 * s * 2.02; a *= 0.5; }
  return c + 0.04;
}

// height above sea level in km. oct = how many detail octaves (fractional).
// y = altitude of the point asking: once the ground provably lies well below it, stop early and
// return that upper bound (still a safe distance for the ray march). Pass -1e9 for the exact height.
float terrainY(vec3 p, float oct, float y) {
  vec3 q = normalize(p) * R;
  float c = continent(q);
  float base = c > 0.0 ? c * 1.5 : c * 5.0;
  if (c < -0.12) return base;
  float land = smoothstep(-0.12, 0.10, c);
  float mm = smoothstep(-0.25, 0.45, noise(q * (1.0 / 110.0) + vec3(40.0)));
  float mount = smoothstep(-0.03, 0.07, c) * mm * mm;
  float amp = land * (0.25 + MTN * mount);
  base -= land * 0.2;
  vec3 s = q * (1.0 / 16.0);
  float a = 0.0, b = 1.0; vec3 dd = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    // every later octave adds at most its weight, so a + 2b bounds the final sum
    float hi = base + amp * (a + 2.0 * b);
    if (y - hi > 0.6 * (y - base - amp * a)) return hi;
    vec4 n = noised(s);
    // ridged: crests where the noise crosses zero (rounded a little, so the slope stays continuous)
    float sa = sqrt(n.x * n.x + 0.012), rg = 1.0 - sa, sm = 0.5 + 0.5 * n.x;
    dd += n.yzw * (w * DAMP * mix(0.5, -2.0 * rg * n.x / sa, RIDGE));
    a += w * b * mix(sm, rg * rg, RIDGE) / (1.0 + dot(dd, dd));
    b *= 0.5; s = M3 * s * 2.0;
  }
  return base + amp * a;
}
float terrain(vec3 p, float oct) { return terrainY(p, oct, -1e9); }

// ray / sphere centred on the origin. returns (near, far) or (-1,-1).
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float l = length(ro);
  float b = dot(ro, rd), c = (l - r) * (l + r), h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
