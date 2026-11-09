// ---- one ray per pixel: space, air, cloud, land, sea ----
vec3 stars(vec3 rd) {
  vec3 p = rd * 190.0; ivec3 c = ivec3(floor(p));
  float h = h1(c);
  if (h < 0.990) return vec3(0.0);
  vec3 off = vec3(h1(c + 7), h1(c + 13), h1(c + 29)) - 0.5;
  float d = length(p - floor(p) - 0.5 - off * 0.6);
  float b = (h - 0.990) / 0.010; b = 0.25 + 9.0 * b * b * b;
  vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.84, 1.0), h1(c + 41));
  return tint * b * smoothstep(0.11, 0.0, d);
}

vec3 sunDisk(vec3 rd) {
  float mu = dot(rd, uSun);
  float x = acos(clamp(mu, -1.0, 1.0)) / 0.0085;
  if (x > 1.0) return vec3(0.0);
  float limb = 0.45 + 0.55 * sqrt(1.0 - x * x);
  return vec3(1.0, 0.96, 0.90) * 2600.0 * limb * smoothstep(1.0, 0.9, x);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter - 0.5 * uRes) / uRes.y * 2.0 * uTanFov;
  vec3 rd = normalize(uCam * vec3(uv, 1.0));
  vec3 ro = uCamPos;
  // where along each step the samples sit, shifted every frame. Air is smooth, so it takes a regular dither
  // (interleaved gradient noise) that the eye barely sees. Clouds have surfaces, and a regular dither beats against
  // them and draws fringes, so they get a random offset per pixel instead.
  vec2 fc = gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0);
  float jitA = fract(52.9829189 * fract(0.06711056 * fc.x + 0.00583715 * fc.y));
  float jit = h1(ivec3(gl_FragCoord.xy, int(uFrame)));

  // daylight drowns the stars: they belong to the view from above the air
  vec3 bg = stars(rd) * smoothstep(8.0, 70.0, length(uCamPos) - R) + sunDisk(rd);
  vec2 atm = sphere(ro, rd, RA);
  if (atm.y < 0.0) { outColor = vec4(bg, 1.0); return; }
  float tA = max(atm.x, 0.0), tEnd = atm.y;

  float alt = length(ro) - R;
  vec2 oc = sphere(ro, rd, R), sh = sphere(ro, rd, R + HMAX);
  float tO = oc.x > 0.0 ? oc.x : -1.0;
  int kind = 0; float tHit = 0.0;
  if (sh.y > 0.0) {
    float ta = alt > HMAX ? sh.x : 0.0;
    float tb = tO > 0.0 ? tO : sh.y;
    float tm = march(ro, rd, ta, tb);
    if (tm > 0.0) { kind = 1; tHit = tm; }
    else if (tO > 0.0) { kind = 2; tHit = tO; }
  }

  vec3 surf = bg;
  if (kind == 1) surf = shadeLand(ro + rd * tHit, tHit);
  if (kind == 2) surf = shadeOcean(ro + rd * tHit, rd, tHit);
  if (kind > 0) tEnd = tHit;

  float tc;
  vec4 cl = clouds(ro, rd, tEnd, jit, tc);
  vec3 S = vec3(0.0), T = vec3(1.0), col;
  if (cl.a > 0.003) {
    tc = clamp(tc, tA, tEnd);
    scatter(ro, rd, tA, tc, uAtmoSteps / 2, jitA, S, T);
    vec3 S2 = vec3(0.0), T2 = vec3(1.0);
    scatter(ro, rd, tc, tEnd, uAtmoSteps / 2, jitA, S2, T2);
    col = S + T * (cl.rgb + (1.0 - cl.a) * (S2 + T2 * surf));
  } else {
    scatter(ro, rd, tA, tEnd, uAtmoSteps, jitA, S, T);
    col = S + T * surf;
  }
  // one bad pixel would poison the whole bloom chain: keep every value finite
  outColor = vec4(clamp(col, 0.0, 6e4), 1.0);
}
