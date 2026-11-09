// ---- terrain marching, land and ocean shading ----
float octFor(float t, float k) { return clamp(log2(16.0 / (max(t, 0.01) * uPix * k)), 2.0, 14.0); }

float march(vec3 ro, vec3 rd, float ta, float tb) {
  float t = ta, lh = 0.0, lt = ta;
  for (int i = 0; i < uSteps; i++) {
    vec3 p = ro + rd * t;
    float y = length(p) - R;
    float h = y - terrainY(p, octFor(t, 3.0), y);
    if (h < 0.0004 * t) {
      if (h < 0.0 && lh > 0.0) t = lt + (t - lt) * lh / (lh - h);
      return t;
    }
    lh = h; lt = t;
    t += max(h * 0.42, t * 0.0007);
    if (t > tb) return -1.0;
  }
  return t;
}

vec3 calcNormal(vec3 p, float t) {
  float e = max(0.0012, t * uPix);
  float oc = octFor(t, 0.6);
  vec3 up = normalize(p);
  vec3 tx = normalize(cross(up, vec3(0.31, 0.87, 0.38)));
  vec3 tz = cross(up, tx);
  float hx = terrain(p + tx * e, oc) - terrain(p - tx * e, oc);
  float hz = terrain(p + tz * e, oc) - terrain(p - tz * e, oc);
  return normalize(up * 2.0 * e - tx * hx - tz * hz);
}

float shadow(vec3 p, float t) {
  float res = 1.0, s = 0.02 + 0.004 * t;
  for (int i = 0; i < uShadowSteps; i++) {
    vec3 q = p + uSun * s;
    float a = length(q) - R;
    if (a > HMAX) break;
    float h = a - terrainY(q, octFor(t + s, 8.0), a);
    res = min(res, 9.0 * h / s);
    if (res < 0.005) break;
    s += clamp(h * 0.7, 0.03 + 0.01 * t, 4.0);
  }
  return smoothstep(0.0, 1.0, res);
}

float cloudShadow(vec3 p) {
  float ts = sphere(p, uSun, R + 0.5 * (CLO + CHI)).y;
  vec3 pc = p + uSun * ts;
  float d = cloudDensity(pc, cloudCover(pc), 0.0);
  return mix(1.0, exp(-d * 5.0), smoothstep(-0.05, 0.1, dot(normalize(p), uSun)));
}

vec3 shadeLand(vec3 p, float t) {
  vec3 n = calcNormal(p, t);
  vec3 up = normalize(p), q = up * R;
  float h = length(p) - R, slope = dot(n, up), lat = abs(up.y);
  vec4 v1 = tnp(q * (1.0 / 6000.0)), v2 = tn(q * (1.0 / 60.0) + 0.4);
  float moist = v1.r * 0.7 + v1.g * 0.3;
  vec3 veg = mix(vec3(0.19, 0.27, 0.07), vec3(0.045, 0.11, 0.035), smoothstep(0.35, 0.65, v2.r));
  vec3 dry = mix(vec3(0.58, 0.40, 0.24), vec3(0.50, 0.44, 0.30), v2.g);
  vec3 rock = mix(vec3(0.26, 0.23, 0.21), vec3(0.36, 0.31, 0.27), v2.b);
  vec3 c = mix(dry, veg, smoothstep(0.42, 0.56, moist));
  c = mix(c, rock, smoothstep(1.0, 2.4, h + (v2.a - 0.5) * 0.8));
  c = mix(c, rock, smoothstep(0.86, 0.66, slope));
  c = mix(c, vec3(0.62, 0.53, 0.38), smoothstep(0.035, 0.006, h));
  float line = mix(2.7, -0.4, smoothstep(0.55, 0.92, lat)) + (v2.r - 0.5) * 0.7;
  float sn = smoothstep(line, line + 0.45, h) * smoothstep(0.50, 0.72, slope);
  c = mix(c, vec3(0.88, 0.91, 0.97), sn);

  float ndl = max(dot(n, uSun), 0.0);
  float sh = ndl > 0.0 ? shadow(p, t) * cloudShadow(p) : 0.0;
  vec3 L = sunLight(p);
  vec3 col = c * (L * ndl * sh / PI + ambient(p) * (0.35 + 0.65 * slope) / PI * 1.6);
  // snow sparkle / wet sand keep a little specular
  vec3 hv = normalize(uSun - normalize(p - uCamPos));
  col += L * sh * sn * 0.08 * pow(max(dot(n, hv), 0.0), 40.0);
  return col;
}

vec3 shadeOcean(vec3 p, vec3 rd, float t) {
  vec3 up = normalize(p);
  float fp = t * uPix;
  vec3 g = vec3(0.0); float f = 3.0, a = 1.0, lost = 0.0;
  for (int i = 0; i < 6; i++) {
    float keep = smoothstep(1.2 * fp, 5.0 * fp, 1.0 / f);
    lost += a * (1.0 - keep);
    if (keep > 0.0) g += noised(p * f + vec3(uTime * 0.35 * sqrt(1.0 / f) * f, 0.0, uTime * 0.2)).yzw * a * keep;
    f *= 2.6; a *= 0.66;
  }
  g -= up * dot(g, up);
  vec3 n = normalize(up - g * 0.05);
  float ndv = max(dot(n, -rd), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  F *= 1.0 - 0.5 * clamp(lost * 0.35, 0.0, 1.0);          // rough far water reflects less at grazing angles

  float depth = -terrain(p, 6.0);
  vec3 L = sunLight(p);
  float cs = cloudShadow(p);
  float sh = (t < 250.0 ? shadow(p, t) : 1.0) * cs;
  float ndl = max(dot(up, uSun), 0.0);
  vec3 deep = vec3(0.006, 0.045, 0.10), shallow = vec3(0.03, 0.30, 0.30);
  vec3 body = mix(shallow, deep, 1.0 - exp(-max(depth, 0.0) / 0.045));
  body = mix(body, vec3(0.45, 0.42, 0.30), 0.6 * exp(-max(depth, 0.0) / 0.006));
  vec3 col = body * (L * ndl * sh / PI + ambient(p) / PI * 1.6);

  // reflected sky
  vec3 rf = reflect(rd, n);
  rf = normalize(rf + up * max(0.0, 0.02 - dot(rf, up)));
  vec3 S = vec3(0.0), T = vec3(1.0);
  scatter(p + up * 0.01, rf, 0.0, sphere(p, rf, RA).y, 6, 0.5, S, T);
  col = mix(col, S, F);

  // sun glitter
  float rough = 0.045 + 0.10 * clamp(lost * 0.3, 0.0, 1.0);
  vec3 hv = normalize(uSun - rd);
  float ndh = max(dot(n, hv), 0.0), a2 = rough * rough;
  float D = a2 / (PI * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(hv, -rd), 0.0), 5.0);
  col += L * sh * D * Fs * 0.25 / max(ndv, 0.12) * step(0.0, dot(up, uSun));

  // surf line
  float foam = smoothstep(0.006, 0.0, depth) * smoothstep(0.35, 0.75, tn(p * 0.9).r + 0.25);
  col = mix(col, vec3(0.85) * (L * ndl * sh / PI + ambient(p) / PI * 1.6), foam * 0.8);
  return col;
}
