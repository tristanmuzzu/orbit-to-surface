// ---- volumetric clouds in a shell between CLO and CHI ----
// uNoise is a 64^3 tiling noise volume built at start-up from the same hash.
vec4 tn(vec3 p) {
  p *= 64.0;
  vec3 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 64.0, 0.0);   // explicit LOD: safe inside loops on Direct3D
}

// The GPU blends texels with only 8 bits of weight, which turns slow noise into stairs 1/256 of a cell wide.
// Where one cell spans kilometres, blend the eight corners here instead, at full precision.
vec4 tnp(vec3 p) {
  p *= 64.0;
  vec3 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  ivec3 a = ivec3(i) & 63, b = (a + 1) & 63;
  vec4 x0 = mix(texelFetch(uNoise, a, 0), texelFetch(uNoise, ivec3(b.x, a.y, a.z), 0), f.x);
  vec4 x1 = mix(texelFetch(uNoise, ivec3(a.x, b.y, a.z), 0), texelFetch(uNoise, ivec3(b.x, b.y, a.z), 0), f.x);
  vec4 x2 = mix(texelFetch(uNoise, ivec3(a.x, a.y, b.z), 0), texelFetch(uNoise, ivec3(b.x, a.y, b.z), 0), f.x);
  vec4 x3 = mix(texelFetch(uNoise, ivec3(a.x, b.y, b.z), 0), texelFetch(uNoise, b, 0), f.x);
  return mix(mix(x0, x1, f.y), mix(x2, x3, f.y), f.z);
}

// sky light that fills shadows; fades through the terminator
vec3 ambient(vec3 p) {
  float e = dot(normalize(p), uSun);
  vec3 day = vec3(0.42, 0.62, 1.0) * 0.55;
  vec3 dusk = vec3(0.55, 0.42, 0.62) * 0.16;
  return mix(dusk, day, smoothstep(0.0, 0.35, e)) * smoothstep(-0.22, 0.05, e);
}

// large weather systems: x = cover 0..1, y = how high the tops reach (fraction of the shell)
vec2 cloudCover(vec3 p) {
  vec3 s = p * (1.0 / 5200.0) + vec3(0.31, 0.77, 0.13);   // one noise cell = 80 km
  vec4 w = tnp(s * 0.7 + 0.37);
  s += (w.xyz - 0.5) * 0.07;
  s += (tnp(s * 3.1 + 0.61).yzx - 0.5) * 0.022;
  float n2 = tnp(s * 2.3 + 0.2).g, n5 = tnp(s * 5.1).b;
  float c = tnp(s).r * 0.34 + n2 * 0.24 + n5 * 0.18
          + tn(s * 11.7 + 0.4).a * 0.14 + tn(s * 27.0).r * 0.10;
  // the dive goes down a well in the cloud deck: thin the cover along that stretch of the path
  vec3 q = normalize(p) * R, ab = uHoleB - uHoleA;
  float hd = length(q - uHoleA - ab * clamp(dot(q - uHoleA, ab) / dot(ab, ab), 0.0, 1.0));
  c -= 0.30 * (1.0 - smoothstep(3.0, 15.0, hd));
  // tops rise and fall over tens of kilometres, so a distant deck has a skyline instead of a ruled edge
  return vec2(smoothstep(0.46, 0.62, c), mix(0.45, 1.0, smoothstep(0.40, 0.60, 0.5 * (n2 + n5))));
}
float cloudDensity(vec3 p, vec2 cv, float lod) {
  float cov = cv.x;
  float h = (length(p) - R - CLO) / (CHI - CLO) / cv.y;
  if (h < 0.0 || h > 1.0 || cov < 0.01) return 0.0;
  float prof = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.25 + 0.55 * cov, h);
  // height counts four-fold in the lookup, so the shapes billow instead of being extruded straight up
  vec3 q = normalize(p) * (R + (length(p) - R) * 4.0) * (1.0 / 800.0) + vec3(uTime * 2e-5, 0.0, uTime * 1e-5);
  // lod: 1 = near (exact blend, fine detail), 0 = far, -1 = light march. The light march multiplies small steps in
  // density into visible contour lines of shadow, so it needs the exact blend as well.
  float b = abs(lod) > 0.5 ? tnp(q).g * 0.62 + tnp(q * 2.03 + 0.11).r * 0.38 : tn(q).g * 0.62 + tn(q * 2.03 + 0.11).r * 0.38;
  float d = b * prof - mix(0.80, 0.40, cov);
  if (d <= -0.08) return 0.0;
  if (lod > 0.5) {
    // fine noise eats the edges and leaves the cores solid
    float e = tn(q * 5.3 + 0.23).b * 0.6 + tn(q * 13.7).a * 0.4;
    d -= (1.0 - e) * 0.16 * (1.0 - smoothstep(0.0, 0.25, d)) - 0.05;
  }
  return clamp(d * 7.0, 0.0, 1.0);
}

// returns premultiplied colour + alpha; tc is the opacity-weighted depth
vec4 clouds(vec3 ro, vec3 rd, float tEnd, float jit, out float tc) {
  tc = tEnd;
  vec2 o = sphere(ro, rd, R + CHI), n = sphere(ro, rd, R + CLO);
  if (o.y < 0.0) return vec4(0.0);
  float l = length(ro) - R;
  float ta, tb;
  if (l > CHI)      { ta = o.x; tb = n.x > 0.0 ? n.x : o.y; }
  else if (l > CLO) { ta = 0.0; tb = n.x > 0.0 ? n.x : o.y; }
  else              { ta = n.y; tb = o.y; }
  tb = min(tb, tEnd);
  tb = min(tb, ta + 260.0);
  if (tb <= ta) return vec4(0.0);

  float len = tb - ta;
  int N = uCloudSteps;
  // step length grows in proportion to distance from the eye: fine up close, even across a far-off deck
  const float T0 = 1.5;
  float k = log((tb + T0) / (ta + T0));
  float mu = dot(rd, uSun);
  float ph = mix(0.9 * (1.0 - 0.36) / pow(1.36 - 1.2 * mu, 1.5), 1.0, 0.45) / (4.0 * PI) * 1.9;

  vec3 col = vec3(0.0); float T = 1.0, wsum = 0.0, tsum = 0.0;
  vec3 Ls = vec3(0.0), La = vec3(0.0); bool lit = false;
  float tPrev = ta, tLast = ta; bool inside = false; int entries = 0;
  for (int i = 0; i < N; i++) {
    float x = (float(i) + jit) / float(N);
    float t = (ta + T0) * exp(k * x) - T0;
    float xn = float(i + 1) / float(N);
    float tNext = (ta + T0) * exp(k * xn) - T0;
    float ds = tNext - tPrev; tPrev = tNext;
    vec3 p = ro + rd * t;
    vec2 cov = cloudCover(p);
    float lod = t < 90.0 ? 1.0 : 0.0;
    float d = cloudDensity(p, cov, lod);
    if (d > 0.002) {
      if (!lit) { Ls = sunLight(p); La = ambient(p); lit = true; }
      // Entering a cloud: how deep this sample landed is an accident of the step grid, and far away a step is
      // kilometres long, so shading it there draws the grid on the cloud as rings and dots. Find the surface
      // between the last two samples and walk in from it instead, in four slices that start thin.
      // Only the first two clouds along a ray get this: they are the ones in view, and it costs about fifteen steps.
      int M = 1; float tS = t, L = t - tLast;
      if (!inside && T > 0.2 && L > 0.25 && entries < 2) {
        entries++;
        float a0 = tLast, b0 = t;
        for (int j = 0; j < 8; j++) {
          float m = 0.5 * (a0 + b0); vec3 pm = ro + rd * m;
          if (cloudDensity(pm, cloudCover(pm), lod) > 0.002) b0 = m; else a0 = m;
        }
        tS = b0; M = 4;
      }
      inside = true;
      for (int m = 0; m < M; m++) {
        vec3 pl = p; vec2 cl = cov; float dd = d, seg = min(ds, 2.0), tt = t;
        if (M > 1) {
          float e0 = float(m * m) / 16.0, e1 = float((m + 1) * (m + 1)) / 16.0;
          tt = tS + L * 0.5 * (e0 + e1); pl = ro + rd * tt;
          cl = cloudCover(pl); dd = cloudDensity(pl, cl, lod);
          // long slices are capped for the same reason as long steps: the cloud in them is thinner than they are
          seg = min(L * (e1 - e0), 1.0);
          if (dd <= 0.002) continue;
        }
        // light march toward the sun
        float od = 0.0, st = 0.12;
        for (int j = 0; j < 4; j++) {
          od += cloudDensity(pl + uSun * st * 1.6, cl, -1.0) * st * 2.0;
          st *= 2.1;
        }
        float beer = exp(-od * 5.0) + 0.35 * exp(-od * 1.1);
        float hgt = clamp((length(pl) - R - CLO) / (CHI - CLO), 0.0, 1.0);
        vec3 L1 = Ls * beer * ph * (1.0 - exp(-dd * 6.0 - 0.3)) + La * (0.35 + 0.65 * hgt)
                + Ls * 0.05 * (0.3 + 0.7 * hgt);     // light that has bounced around inside the cloud
        // far steps are kilometres long but the cloud in them is not: capping the length keeps thin cloud translucent
        // there instead of flickering between solid and absent from pixel to pixel
        float a = 1.0 - exp(-dd * seg * 9.0);
        col += T * a * L1;
        wsum += T * a; tsum += T * a * tt;
        T *= 1.0 - a;
        if (T < 0.015) break;
      }
      if (T < 0.015) break;
    } else inside = false;
    tLast = t;
  }
  if (wsum > 0.0) tc = tsum / wsum;
  return vec4(col, 1.0 - T);
}
