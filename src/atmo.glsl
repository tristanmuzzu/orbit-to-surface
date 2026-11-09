// ---- atmosphere: single scattering, Rayleigh + Mie + ozone ----
const float HR = 8.0, HM = 1.3;
const vec3  BR = vec3(5.8e-3, 13.5e-3, 33.1e-3) * 2.2;
const float BM = 4.0e-3 * 1.8;
const vec3  BO = vec3(0.65e-3, 1.88e-3, 0.085e-3) * 2.2;
const float SUN_I = 22.0;

vec3 density(float h) {
  h = max(h, 0.0);
  return vec3(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}

vec3 extinction(vec3 od) { return exp(-(BR * od.x + BM * 1.1 * od.y + BO * od.z)); }

// how much of the planet's body blocks the sun at p (0 = night, 1 = lit)
float planetShadow(vec3 p) {
  float s = dot(p, uSun);
  if (s > 0.0) return 1.0;
  float d = length(p - uSun * s);
  return smoothstep(R - 3.0, R + 1.0, d);
}

// optical depth from p to the sun, through the atmosphere
vec3 sunDepth(vec3 p) {
  float t1 = sphere(p, uSun, RA).y;
  const int N = 5;
  vec3 od = vec3(0.0); float t = 0.0;
  for (int i = 0; i < N; i++) {
    // steps grow away from p, where the air is thin
    float tn = t1 * pow(float(i + 1) / float(N), 2.0);
    float tm = 0.5 * (t + tn);
    od += density(length(p + uSun * tm) - R) * (tn - t);
    t = tn;
  }
  return od;
}

// colour of direct sunlight arriving at p
vec3 sunLight(vec3 p) { return SUN_I * extinction(sunDepth(p)) * planetShadow(p); }

// in-scattered light and transmittance along ro + rd * [ta, tb]
void scatter(vec3 ro, vec3 rd, float ta, float tb, int n, float jit, inout vec3 S, inout vec3 T) {
  if (tb <= ta) return;
  float mu = dot(rd, uSun);
  float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  const float g = 0.76;
  float pm = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float dt = (tb - ta) / float(n);
  for (int i = 0; i < n; i++) {
    vec3 p = ro + rd * (ta + (float(i) + jit) * dt);
    vec3 d = density(length(p) - R);
    vec3 sig = BR * d.x + BM * 1.1 * d.y + BO * d.z;       // extinction here
    vec3 stepT = exp(-sig * dt);
    vec3 L = sunLight(p);
    // small isotropic term stands in for multiple scattering
    vec3 src = L * (BR * d.x * pr + BM * d.y * pm) + L * (BR * d.x + BM * d.y) * 0.035;
    // skylight scattered a second time keeps the upper sky blue at sunset
    float e = dot(p, uSun) / length(p);
    src += vec3(0.06, 0.14, 0.36) * (SUN_I * 0.008) * smoothstep(-0.12, 0.25, e) * BR * d.x / BR.b;
    // energy-conserving integration over the step
    S += T * src * (1.0 - stepT) / max(sig, vec3(1e-7));
    T *= stepT;
  }
}
