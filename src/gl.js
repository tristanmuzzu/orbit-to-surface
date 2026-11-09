// ---- WebGL2 plumbing: programs, HDR targets, bloom chain ----
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
  document.getElementById('err').textContent = 'This demo needs WebGL2 with float render targets.';
  throw new Error('no webgl2 float targets');
}

const VS = `#version 300 es
in vec2 a; out vec2 vUv;
void main(){ vUv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
const POST_HEAD = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;`;
const FS_COPY = POST_HEAD + `void main(){ o = texture(uTex, vUv); }`;
const FS_DOWN = POST_HEAD + `uniform float uFirst;
vec3 s(vec2 d){ vec3 c = texture(uTex, vUv + d * uTexel).rgb; return uFirst > 0.5 ? min(c, vec3(220.0)) : c; }
void main(){ o = vec4((s(vec2(0)) * 4.0 + s(vec2(1,1)) + s(vec2(-1,1)) + s(vec2(1,-1)) + s(vec2(-1,-1))) / 8.0, 1.0); }`;
const FS_UP = POST_HEAD + `uniform float uGain;
vec3 s(vec2 d){ return texture(uTex, vUv + d * uTexel).rgb; }
void main(){ o = vec4((s(vec2(2,0)) + s(vec2(-2,0)) + s(vec2(0,2)) + s(vec2(0,-2))
  + 2.0 * (s(vec2(1,1)) + s(vec2(-1,1)) + s(vec2(1,-1)) + s(vec2(-1,-1)))) / 12.0 * uGain, 1.0); }`;
const FS_FINAL = POST_HEAD + `uniform sampler2D uBloom; uniform float uExposure, uSeed, uFade, uBloomScale;
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 d = vUv - 0.5;
  // a hair of chromatic aberration toward the corners
  vec3 c = vec3(texture(uTex, vUv - d * 0.0016).r, texture(uTex, vUv).g, texture(uTex, vUv + d * 0.0016).b);
  vec3 b = texture(uBloom, vUv).rgb * uBloomScale;
  c = mix(c, b, 0.05) + b * 0.03 * vec3(1.0, 0.82, 0.62);
  c *= uExposure * (1.0 - 0.38 * dot(d, d) * 1.6);
  c = aces(c);
  // grade: a little more colour, a soft S-curve
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.14);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  c += (rnd(gl_FragCoord.xy + uSeed) - 0.5) * 0.018;
  o = vec4(c * uFade, 1.0);
}`;

function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      document.getElementById('err').textContent = log;
      throw new Error(log);
    }
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function target(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

// 64^3 volume of random bytes: four independent noise channels, built with the terrain hash
function noiseVolume() {
  const N = 64, data = new Uint8Array(N * N * N * 4);
  let i = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = hu(x + 101, y + 211, z + 307);
    data[i++] = h & 255; data[i++] = (h >>> 8) & 255; data[i++] = (h >>> 16) & 255; data[i++] = h >>> 24;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
  return tex;
}

const P = {
  scene: program(VS, SCENE_FS), copy: program(VS, FS_COPY),
  down: program(VS, FS_DOWN), up: program(VS, FS_UP), final: program(VS, FS_FINAL),
};
const noiseTex = noiseVolume();
let RT = null;   // { scene, accum, chain[] }

function resizeTargets(w, h) {
  if (RT && RT.scene.w === w && RT.scene.h === h) return;
  if (RT) { freeTarget(RT.scene); freeTarget(RT.accum); RT.chain.forEach(freeTarget); }
  const chain = [];
  let cw = w, ch = h;
  while (ch > 6 && chain.length < 9) { cw = Math.ceil(cw / 2); ch = Math.ceil(ch / 2); chain.push(target(cw, ch)); }
  RT = { scene: target(w, h), accum: target(w, h), chain };
}

function pass(prog, dst, src, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height);
  gl.useProgram(prog.p);
  if (src) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(prog.u.uTex, 0); gl.uniform2f(prog.u.uTexel, 1 / src.w, 1 / src.h);
  }
  if (setup) setup(prog.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// draw the scene `samples` times (jittered in space, optionally in time) and average
function renderScene(view, opts) {
  const { w, h, samples = 1, steps = 150, shadowSteps = 24, cloudSteps = 40, atmoSteps = 16, frame = 0, strips = 1 } = opts;
  resizeTargets(w, h);
  const multi = samples > 1;
  if (multi) { gl.bindFramebuffer(gl.FRAMEBUFFER, RT.accum.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  for (let s = 0; s < samples; s++) {
    const v = typeof view === 'function' ? view(samples > 1 ? (s + 0.5) / samples : 0.5) : view;
    pass(P.scene, RT.scene, null, u => {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, noiseTex); gl.uniform1i(u.uNoise, 1);
      gl.uniform2f(u.uRes, w, h);
      // Halton(2,3) sub-pixel offsets
      let jx = 0, jy = 0;
      if (multi) { let f = 0.5, i = s + 1; while (i) { jx += f * (i & 1); i >>= 1; f *= 0.5; } f = 1 / 3; i = s + 1; while (i) { jy += f * (i % 3); i = Math.floor(i / 3); f /= 3; } jx -= 0.5; jy -= 0.5; }
      gl.uniform2f(u.uJitter, jx, jy);
      gl.uniform3fv(u.uCamPos, v.pos);
      gl.uniformMatrix3fv(u.uCam, false, [...v.right, ...v.up, ...v.fwd]);
      gl.uniform1f(u.uTanFov, v.tanFov);
      gl.uniform3fv(u.uSun, v.sun);
      gl.uniform1f(u.uTime, v.time);
      gl.uniform3fv(u.uHoleA, HOLE[0]); gl.uniform3fv(u.uHoleB, HOLE[1]);
      gl.uniform1f(u.uPix, 2 * v.tanFov / h);
      gl.uniform1f(u.uFrame, frame * 7 + s * 3);
      gl.uniform1i(u.uSteps, steps); gl.uniform1i(u.uShadowSteps, shadowSteps); gl.uniform1i(u.uCloudSteps, cloudSteps); gl.uniform1i(u.uAtmoSteps, atmoSteps);
      // optional: draw in horizontal bands, handing the GPU back between them
      if (strips > 1) {
        const y = i => Math.floor(h * i / strips);
        gl.enable(gl.SCISSOR_TEST);
        for (let i = 0; i < strips - 1; i++) { gl.scissor(0, y(i), w, y(i + 1) - y(i)); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.flush(); }
        gl.scissor(0, y(strips - 1), w, h - y(strips - 1));
      }
    });
    gl.disable(gl.SCISSOR_TEST);
    if (multi) {
      gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, 1 / samples); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE);
      pass(P.copy, RT.accum, RT.scene);
      gl.disable(gl.BLEND);
    }
  }
  return multi ? RT.accum : RT.scene;
}

const BLOOM_GAIN = 0.78;   // each wider bloom level counts a little less: hot core, long faint tail
// log-average scene luminance, read back from the smallest bloom level
const meterBuf = new Float32Array(4096);
function meter(t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.FLOAT, meterBuf);
  let s = 0; const n = Math.min(1024, t.w * t.h);
  for (let i = 0; i < n; i++) s += Math.log(0.2126 * meterBuf[i * 4] + 0.7152 * meterBuf[i * 4 + 1] + 0.0722 * meterBuf[i * 4 + 2] + 0.004);
  return Math.exp(s / n);
}

// exposure(avg) picks the exposure once the frame has been metered
function present(hdr, exposure, fade, seed) {
  const c = RT.chain;
  pass(P.down, c[0], hdr, u => gl.uniform1f(u.uFirst, 1));
  for (let i = 1; i < c.length; i++) pass(P.down, c[i], c[i - 1], u => gl.uniform1f(u.uFirst, 0));
  if (typeof exposure === 'function') exposure = exposure(meter(c[c.length - 1]));
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = c.length - 1; i > 0; i--) pass(P.up, c[i - 1], c[i], u => gl.uniform1f(u.uGain, BLOOM_GAIN));
  gl.disable(gl.BLEND);
  pass(P.final, null, hdr, u => {
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, c[0].tex); gl.uniform1i(u.uBloom, 2);
    gl.uniform1f(u.uExposure, exposure); gl.uniform1f(u.uBloomScale, (1 - BLOOM_GAIN) / (1 - Math.pow(BLOOM_GAIN, c.length)));
    gl.uniform1f(u.uSeed, seed); gl.uniform1f(u.uFade, fade);
  });
}
