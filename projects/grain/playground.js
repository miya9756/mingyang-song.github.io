/* PGNM playground: the two equations, one knob at a time.
 *
 *   t_c = sum_i A_ci * z_i                 latent field (a full RGB convolution of Gaussian noise)
 *   y_c = clip(x_c + g_c(x_c, t_c), 0, 1)  noisy image (a residual lookup, added once)
 *
 * The arithmetic is engine.js, a verbatim copy of the PGNM Designer's browser engine
 * (parametric-noise-modeling/frontend/engine.js, tested there against pgnm/). Three figures:
 *
 * 1. Steps: z -> t -> n -> y on one 256x256 picture, as the supplementary video's 2D scene
 *    shows it (video/content.js): a convolution front sweeping across, then the lookup
 *    sweeping through clean intensities. Drawn in WebGL2; the strength bars are computed on
 *    the CPU from exactly what the panel shows, which is also the no-WebGL fallback.
 * 2. Machine: the lookup as conditional quantile mapping, with particles.
 * 3. Mixer: the Designer's joint PCA space as a pad (filter PC1 x lookup PC1, the paper's
 *    Fig. 7 axes). The field is kept as one part per filter component, so a drag only
 *    re-weights the parts.
 *
 * No top-level await: boot() keeps the module parseable by the esprima check (CLAUDE.md).
 */
import { renderScene } from "./scene.js";

// engine.js is a classic script whose top-level `const` is a global binding, not a window property.
const E = PGNMEngine; // eslint-disable-line no-undef
const N = 256, PAD = 24, I = 256, T = 25;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const CH = ["red", "green", "blue"];
// Every data file is named relative to the manifest, so this is the one literal path in the module.
const MANIFEST = new URL("data/manifest.json", import.meta.url);

let manifest, knots, cleanRGBA, clean;     // clean: Float32Array N*N*3 in [0, 1]
const presets = new Map();                 // id -> { kernels, g }
let current = null;                        // id of the preset the first two figures use

// ── the residual lookup, as engine.render() evaluates it but without the clip ───────────

function residual(g, c, x, t) {
  const ip = clamp01(x) * (I - 1), ii = Math.min(Math.floor(ip), I - 2), iw = ip - ii;
  const gp = (t - knots[0]) / (knots[1] - knots[0]);
  const gi = Math.min(Math.max(Math.floor(gp), 0), T - 2), gw = gp - gi;
  const a = (c * I + ii) * T + gi, b = a + T;
  const lower = g[a] + gw * (g[a + 1] - g[a]), upper = g[b] + gw * (g[b + 1] - g[b]);
  return lower + iw * (upper - lower);
}

async function loadPreset(id) {
  if (!presets.has(id)) {
    const entry = manifest.figure.find((p) => p.id === id);
    const buffer = await (await fetch(new URL(entry.file, MANIFEST))).arrayBuffer();
    const data = new Float32Array(buffer);
    if (data.length !== E.KERNEL_SIZE + E.LOOKUP_SIZE) throw Error("Unexpected preset size: " + entry.file);
    presets.set(id, { kernels: data.subarray(0, E.KERNEL_SIZE), g: data.subarray(E.KERNEL_SIZE) });
  }
  return presets.get(id);
}

// ── figure 1: steps ────────────────────────────────────────────────────────────────────────

const SEED = 2026;
const steps = { s: 0, playing: false, target: 0, layers: null, gl: null, scale: [1, 1, 1], gain: 1 };
const STEP_TEXT = [
  { title: "Independent Gaussian noise", eq: "z<sub>i</sub>(p) ~ 𝒩(0, 1)",
    text: "Static. Every pixel and every colour channel is drawn on its own, at the same strength everywhere." },
  { title: "Full RGB convolution", eq: "t<sub>c</sub> = ∑<sub>i</sub> A<sub>ci</sub> ∗ z<sub>i</sub>",
    text: "Each output pixel becomes a weighted blend of the static around it, in all three channels at once. Neighbours and colours become correlated; the strength is still the same everywhere." },
  { title: "Conditional lookup", eq: "n<sub>c</sub> = g<sub>c</sub>(x<sub>c</sub>, t<sub>c</sub>)",
    text: "The clean brightness x picks how strong and how lopsided the noise is. The glowing contour is the brightness being looked up; watch the bars split apart." },
  { title: "Add and clip", eq: "y<sub>c</sub> = clip(x<sub>c</sub> + n<sub>c</sub>, 0, 1)",
    text: "Add the residual to the clean picture once and clip to the valid range. That is the whole model." },
];

/* What the panel shows at timeline position s in [0, 4]: stage k runs over [k, k + 1]. */
function stageAt(s) {
  return {
    fade: smooth(s / 0.6),
    sweep: s < 1 ? -10 : s >= 2 ? N + 10 : -2 + (N + 4) * smooth((s - 1) / 0.85),
    front: s > 1 && s < 1.9 ? 1 : 0,
    look: s < 2 ? -1 : s >= 3 ? 2 : -0.04 + 1.08 * smooth((s - 2) / 0.9),
    contour: s > 2 && s < 2.95 ? 1 : 0,
    image: s < 3 ? 0 : smooth((s - 3) / 0.85),
  };
}

function buildLayers(preset) {
  const nh = N + PAD, z = E.noiseRows(SEED, 0, nh, N);
  const parts = E.fieldParts(preset.kernels, new Float32Array(0), 0, N, N, SEED, () => {}, null, z);
  const layers = { z: new Float32Array(N * N * 3), t: new Float32Array(N * N * 3),
                   n: new Float32Array(N * N * 3), y: new Float32Array(N * N * 3) };
  const sum = [0, 0, 0], sum2 = [0, 0, 0];
  for (let p = 0; p < N * N; p++) {
    const row = Math.floor(p / N), col = p % N;
    for (let c = 0; c < 3; c++) {
      const k = p * 3 + c, x = clean[k];
      layers.z[k] = z[c][(row + PAD / 2) * (N + PAD) + col + PAD / 2];   // rows are N + 24 wide; z centred under the pixel
      layers.t[k] = parts[0][c][p];
      const n = residual(preset.g, c, x, layers.t[k]);
      layers.n[k] = n;
      layers.y[k] = clamp01(x + n);
      sum[c] += n; sum2[c] += n * n;
    }
  }
  // z and t are unit-variance: show them at the residual's own strength per channel, so only
  // the spatial distribution of strength changes at the lookup (the video's display choice).
  steps.scale = [0, 1, 2].map((c) => Math.sqrt(Math.max(sum2[c] / (N * N) - (sum[c] / (N * N)) ** 2, 1e-12)));
  steps.gain = 0.2 / ((steps.scale[0] + steps.scale[1] + steps.scale[2]) / 3);   // ±2.5 sd fills the grey range
  return layers;
}

/* Residual layer at s, per pixel and channel; mirrors the fragment shader. */
function residualAt(k, st) {
  const c = k % 3, x = clean[k], p = (k - c) / 3, col = p % N;
  const conv = clamp01((st.sweep - col) / 1.5);
  const zt = (steps.layers.z[k] + (steps.layers.t[k] - steps.layers.z[k]) * conv) * steps.scale[c] * st.fade;
  const looked = smooth((st.look - x) / 0.03);
  return zt + (steps.layers.n[k] - zt) * looked;
}

/* Tertiles of the clean luminance, for the strength bars. */
let tertile;
function buildTertiles() {
  const lum = new Float32Array(N * N);
  for (let p = 0; p < N * N; p++) lum[p] = (clean[3 * p] + clean[3 * p + 1] + clean[3 * p + 2]) / 3;
  const sorted = Float32Array.from(lum).sort(), edges = [sorted[Math.floor(N * N / 3)], sorted[Math.floor(2 * N * N / 3)]];
  tertile = Uint8Array.from(lum, (v) => (v < edges[0] ? 0 : v < edges[1] ? 1 : 2));
}

function drawBars(st) {
  const s = [0, 0, 0], s2 = [0, 0, 0], n = [0, 0, 0];
  for (let k = 0; k < N * N * 3; k++) {
    const r = residualAt(k, st), b = tertile[(k - (k % 3)) / 3];
    s[b] += r; s2[b] += r * r; n[b]++;
  }
  const sd = [0, 1, 2].map((b) => 255 * Math.sqrt(Math.max(s2[b] / n[b] - (s[b] / n[b]) ** 2, 0)));
  const top = Math.max(...sd, 1e-6), max = steps.barMax = Math.max(steps.barMax || 0, top);
  document.querySelectorAll("#stepBars .sbar").forEach((bar, b) => {
    bar.querySelector("i").style.transform = `scaleY(${sd[b] / max})`;
    bar.querySelector("output").textContent = sd[b].toFixed(1);
  });
}

const VERT = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
// Adapted from panelFragment in the supplementary video (video/content.js).
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D tZ, tT, tN, tX, tY;
uniform vec3 uScale;
uniform vec2 uSize;
uniform float uFade, uSweep, uFront, uLook, uContour, uImage, uGain;
out vec4 fragColor;
const vec3 CHANNEL[3] = vec3[3](vec3(1.0, 0.25, 0.32), vec3(0.25, 1.0, 0.55), vec3(0.3, 0.6, 1.0));
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  ivec2 ij = clamp(ivec2(uv.x * ${N}.0, (1.0 - uv.y) * ${N}.0), ivec2(0), ivec2(${N - 1}));
  vec3 x = texelFetch(tX, ij, 0).rgb;
  vec3 xr = texelFetch(tX, min(ij + ivec2(1, 0), ivec2(${N - 1})), 0).rgb;
  vec3 xd = texelFetch(tX, min(ij + ivec2(0, 1), ivec2(${N - 1})), 0).rgb;
  float conv = clamp((uSweep - float(ij.x)) / 1.5, 0.0, 1.0);
  vec3 zt = mix(texelFetch(tZ, ij, 0).rgb, texelFetch(tT, ij, 0).rgb, conv) * uScale * uFade;
  vec3 looked = smoothstep(x, x + 0.03, vec3(uLook));
  vec3 res = mix(zt, texelFetch(tN, ij, 0).rgb, looked);
  vec3 c = mix(0.5 + uGain * res, texelFetch(tY, ij, 0).rgb, uImage);
  c += vec3(0.35, 0.7, 1.2) * exp(-abs(float(ij.x) - uSweep) / 1.2) * uFront;
  // The contour is drawn where the clean value crosses the level being looked up, between this
  // texel and its right or lower neighbour: a line one texel wide however flat the picture is.
  for (int k = 0; k < 3; k++) {
    float on = max(step((x[k] - uLook) * (xr[k] - uLook), 0.0), step((x[k] - uLook) * (xd[k] - uLook), 0.0));
    c += CHANNEL[k] * on * uContour * 0.9;
  }
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function initGL(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name) => gl.getUniformLocation(program, name);
  const textures = {};
  ["tZ", "tT", "tN", "tX", "tY"].forEach((name, unit) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(u(name), unit);
    textures[name] = { texture, unit };
  });
  const upload = (name, rgb) => {
    const rgba = new Float32Array(N * N * 4);
    for (let p = 0; p < N * N; p++) { rgba[4 * p] = rgb[3 * p]; rgba[4 * p + 1] = rgb[3 * p + 1]; rgba[4 * p + 2] = rgb[3 * p + 2]; }
    gl.activeTexture(gl.TEXTURE0 + textures[name].unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[name].texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N, N, 0, gl.RGBA, gl.FLOAT, rgba);
  };
  return { gl, u, upload };
}

function sizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1, w = Math.round(canvas.clientWidth * dpr);
  if (canvas.width !== w || canvas.height !== w) { canvas.width = w; canvas.height = w; }
}

let fallback;   // 2D context and ImageData when WebGL2 is missing
function drawPanel(st) {
  const canvas = $("stepCanvas");
  if (steps.gl) {
    sizeCanvas(canvas);
    const { gl, u } = steps.gl;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u("uSize"), canvas.width, canvas.height);
    gl.uniform3f(u("uScale"), ...steps.scale);
    gl.uniform1f(u("uGain"), steps.gain);
    gl.uniform1f(u("uFade"), st.fade); gl.uniform1f(u("uSweep"), st.sweep); gl.uniform1f(u("uFront"), st.front);
    gl.uniform1f(u("uLook"), st.look); gl.uniform1f(u("uContour"), st.contour); gl.uniform1f(u("uImage"), st.image);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return;
  }
  if (!fallback) {
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext("2d");
    fallback = { ctx, image: ctx.createImageData(N, N) };
  }
  const d = fallback.image.data;
  for (let k = 0; k < N * N * 3; k++) {
    const r = residualAt(k, st), v = 0.5 + steps.gain * r;
    d[(k - (k % 3)) / 3 * 4 + (k % 3)] = 255 * (v + (steps.layers.y[k] - v) * st.image);
  }
  for (let p = 0; p < N * N; p++) d[4 * p + 3] = 255;
  fallback.ctx.putImageData(fallback.image, 0, 0);
}

function drawClean(st) {
  const ctx = $("stepClean").getContext("2d"), image = ctx.createImageData(N, N);
  image.data.set(cleanRGBA);
  if (st.contour) {
    const tint = [[255, 64, 82], [64, 255, 140], [77, 153, 255]];
    for (let p = 0; p < N * N; p++) {
      const col = p % N, right = col < N - 1 ? p + 1 : p, down = p + N < N * N ? p + N : p;
      for (let c = 0; c < 3; c++) {
        const d = clean[3 * p + c] - st.look;
        if (d * (clean[3 * right + c] - st.look) > 0 && d * (clean[3 * down + c] - st.look) > 0) continue;
        for (let k = 0; k < 3; k++) image.data[4 * p + k] = Math.min(255, image.data[4 * p + k] + 0.9 * tint[c][k]);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawFilters(preset) {
  // Nine 25x25 filters A_ci, rows = output channel c, columns = input channel i. Colours follow
  // the signed square root of each weight so the weak outer taps stay visible (as in the video).
  const canvas = $("stepFilters"), ctx = canvas.getContext("2d"), SCALE = 2;
  const cell = 3.6, block = 25 * cell, gap = 9, left = 20, top = 18, W = left + 3 * block + 2 * gap, H = top + 3 * block + 2 * gap;
  canvas.width = W * SCALE; canvas.height = H * SCALE; canvas.style.width = W + "px";
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let max = 0;
  for (const v of preset.kernels) max = Math.max(max, Math.abs(v));
  const mid = [244, 244, 242], neg = [44, 101, 190], pos = [196, 62, 40];
  for (let out = 0; out < 3; out++) for (let input = 0; input < 3; input++) {
    const x0 = left + input * (block + gap), y0 = top + out * (block + gap);
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
      const v = preset.kernels[((y * 25 + x) * 3 + input) * 3 + out];
      const s = Math.sign(v) * Math.sqrt(Math.abs(v) / max), end = s < 0 ? neg : pos, a = Math.abs(s);
      ctx.fillStyle = `rgb(${mid.map((m, k) => Math.round(m + (end[k] - m) * a)).join(",")})`;
      ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.05, cell + 0.05);
    }
  }
  ctx.fillStyle = "#5c6266";
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  "RGB".split("").forEach((name, k) => {
    ctx.fillText("in " + name, left + k * (block + gap) + block / 2, 12);
    ctx.save(); ctx.translate(10, top + k * (block + gap) + block / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("out " + name, 0, 0); ctx.restore();
  });
}

function renderSteps() {
  if (!steps.layers) return;
  const st = stageAt(steps.s);
  drawPanel(st);
  drawBars(st);
  drawClean(st);
  const stage = Math.min(3, Math.floor(steps.s - 1e-9 < 0 ? 0 : steps.s - 1e-9));
  document.querySelectorAll("#stepList button").forEach((b, k) => {
    b.classList.toggle("on", k === stage);
    b.classList.toggle("done", k < stage || steps.s >= 4);
  });
  $("stepFiltersFig").classList.toggle("live", steps.s > 1 && steps.s < 2);
  $("stepScrub").value = steps.s;
  const text = STEP_TEXT[stage];
  $("stepCap").innerHTML = `<b>${text.title}.</b> ${text.text}`;
  $("stepGain").textContent = `residual ×${steps.gain.toFixed(1)} around grey`;
}

let last = 0;
function tick(now) {
  if (!steps.playing) return;
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  steps.s = Math.min(steps.target, steps.s + dt / 2.6);   // 2.6 s per stage
  renderSteps();
  if (steps.s >= steps.target) { steps.playing = false; $("stepPlay").textContent = "Play"; return; }
  requestAnimationFrame(tick);
}

function playTo(target, from = steps.s) {
  steps.s = from;
  steps.target = target;
  if (REDUCED) { steps.s = target; renderSteps(); return; }
  steps.playing = true;
  last = 0;
  $("stepPlay").textContent = "Pause";
  requestAnimationFrame(tick);
}

async function choose(id) {
  current = id;
  document.querySelectorAll("#presetChips button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  const preset = await loadPreset(id);
  if (current !== id) return;
  steps.layers = buildLayers(preset);
  steps.barMax = 0;
  if (steps.gl) for (const [name, key] of [["tZ", "z"], ["tT", "t"], ["tN", "n"], ["tY", "y"]]) steps.gl.upload(name, steps.layers[key]);
  drawFilters(preset);
  renderSteps();
  machine.reset();
}

function initSteps() {
  const chips = $("presetChips");
  for (const p of manifest.figure) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "chip", textContent: p.label });
    b.dataset.id = p.id;
    b.addEventListener("click", () => choose(p.id));
    chips.append(b);
  }
  const list = $("stepList");
  STEP_TEXT.forEach((text, k) => {
    const li = document.createElement("li");
    const b = Object.assign(document.createElement("button"), { type: "button" });
    b.innerHTML = `<span class="num">${k + 1}</span><span class="what">${text.title}</span><span class="eq">${text.eq}</span>`;
    b.addEventListener("click", () => playTo(k + 1, k));
    li.append(b);
    list.append(li);
  });
  $("stepPlay").addEventListener("click", () => {
    if (steps.playing) { steps.playing = false; $("stepPlay").textContent = "Play"; return; }
    playTo(4, steps.s >= 4 ? 0 : steps.s);
  });
  $("stepScrub").addEventListener("input", (event) => {
    steps.playing = false;
    $("stepPlay").textContent = "Play";
    steps.s = Number(event.target.value);
    renderSteps();
  });
  try {
    steps.gl = initGL($("stepCanvas"));
    if (steps.gl) steps.gl.upload("tX", clean);
  } catch (error) {
    console.error(error);
    steps.gl = null;
  }
  new ResizeObserver(() => renderSteps()).observe($("stepCanvas"));
}

// ── figure 2: the quantile machine ───────────────────────────────────────────────────────

const machine = {
  channel: 1, x: 40 / 255, particles: [], bins: null, landed: 0, spawn: 0, running: false,
  reset() {
    this.particles = [];
    this.bins = new Float64Array(81);
    this.landed = 0;
    this.stats = { n: 0, s: 0, s2: 0, clipped: 0 };
    if (REDUCED) this.fill();
    this.draw();
    this.ensure();
  },
  range() {   // residual axis in 8-bit codes: the preset's widest residual at |t| <= 3, any intensity
    const g = presets.get(current).g, c = this.channel;
    let m = 4 / 255;
    for (let i = 0; i < I; i++) m = Math.max(m, Math.abs(g[(c * I + i) * T]), Math.abs(g[(c * I + i) * T + T - 1]));
    return Math.ceil(m * 255 * 1.1);
  },
  sample(gauss) {   // one draw: t, the residual, and the delivered residual after the clip
    const t = gauss(), n = residual(presets.get(current).g, this.channel, this.x, t);
    const delivered = clamp01(this.x + n) - this.x;
    return { t, n: n * 255, d: delivered * 255, clipped: delivered !== n };
  },
  land(p) {
    const R = this.range(), b = Math.round((p.d / R + 1) / 2 * (this.bins.length - 1));
    if (b >= 0 && b < this.bins.length) this.bins[b]++;
    this.stats.n++; this.stats.s += p.d; this.stats.s2 += p.d * p.d; if (p.clipped) this.stats.clipped++;
  },
  fill() {
    const gauss = E.normal(7);
    for (let k = 0; k < 3000; k++) this.land(this.sample(gauss));
  },
  ensure() {
    if (this.running || REDUCED || !presets.has(current)) return;
    this.running = true;
    this.gauss = E.normal(11);
    let previous = 0;
    const step = (now) => {
      if (!this.visible) { this.running = false; return; }
      const dt = Math.min(0.05, (now - (previous || now)) / 1000);
      previous = now;
      this.spawn += dt * (this.landed < 200 ? 90 : 45);
      while (this.spawn >= 1) { this.spawn--; this.particles.push(Object.assign(this.sample(this.gauss), { age: 0 })); }
      for (const p of this.particles) p.age += dt;
      const done = this.particles.filter((p) => p.age >= 1.25);
      done.forEach((p) => this.land(p));
      this.landed += done.length;
      this.particles = this.particles.filter((p) => p.age < 1.25);
      this.draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  draw() {
    const canvas = $("machineCanvas");
    if (!canvas || !presets.has(current)) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = presets.get(current).g, c = this.channel, R = this.range();
    const left = 44, plotW = Math.max(160, W * 0.62 - left), histL = left + plotW + 28, histW = W - histL - 12;
    const top = 14, plotH = H - 96, bellTop = top + plotH + 14, bellH = H - bellTop - 18;
    const X = (t) => left + (t + 3.5) / 7 * plotW, Y = (n) => top + (1 - (n / R + 1) / 2) * plotH;
    const ink = "#16181a", muted = "#5c6266", line = "#d9dcdf", accent = "#a85a12";
    const tint = ["#c43e28", "#2f8f5b", "#2c65be"][c];
    // the clip walls: where x + n leaves [0, 1]
    const lo = -this.x * 255, hi = (1 - this.x) * 255;
    ctx.fillStyle = "rgba(22,24,26,.06)";
    if (lo > -R) ctx.fillRect(left, Y(lo), plotW + 28 + histW, Y(-R) - Y(lo));
    if (hi < R) ctx.fillRect(left, Y(R), plotW + 28 + histW, Y(hi) - Y(R));
    // axes
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left + plotW, Y(0)); ctx.moveTo(X(0), top); ctx.lineTo(X(0), top + plotH); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = "11px Inter, system-ui, sans-serif"; ctx.textAlign = "right";
    for (const v of [-R, 0, R]) ctx.fillText((v > 0 ? "+" : "") + v, left - 6, Y(v) + 4);
    ctx.save(); ctx.translate(12, top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
    ctx.fillText("residual n (8-bit codes)", 0, 0); ctx.restore();
    ctx.textAlign = "center";
    for (const t of [-3, -2, -1, 0, 1, 2, 3]) ctx.fillText(String(t), X(t), H - 4);
    if (lo > -R) { ctx.textAlign = "left"; ctx.fillText("clipped at black", left + 4, Y(lo) + 13); }
    if (hi < R) { ctx.textAlign = "left"; ctx.fillText("clipped at white", left + 4, Y(hi) - 5); }
    // the bell: t ~ N(0, 1)
    ctx.beginPath();
    for (let k = 0; k <= 140; k++) {
      const t = -3.5 + 7 * k / 140, v = Math.exp(-t * t / 2);
      const px = X(t), py = bellTop + bellH * (1 - v);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.lineTo(X(3.5), bellTop + bellH); ctx.lineTo(X(-3.5), bellTop + bellH); ctx.closePath();
    ctx.fillStyle = "rgba(22,24,26,.08)"; ctx.fill();
    ctx.fillStyle = muted; ctx.textAlign = "left"; ctx.fillText("t ~ 𝒩(0, 1)", left + 2, bellTop + 10);
    // the curve g_c(x, t), extended linearly beyond ±3 as the renderer does
    ctx.beginPath();
    for (let k = 0; k <= 140; k++) {
      const t = -3.5 + 7 * k / 140, n = residual(g, c, this.x, t) * 255;
      k ? ctx.lineTo(X(t), Y(n)) : ctx.moveTo(X(t), Y(n));
    }
    ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke();
    const end = residual(g, c, this.x, 3.5) * 255;   // label the curve at its end, clear of the wall labels
    ctx.fillStyle = ink; ctx.textAlign = "right";
    ctx.fillText(`g(x, t), x = ${Math.round(this.x * 255)}`, left + plotW, Math.min(Math.max(Y(end) - 9, top + 28), top + plotH - 20));
    // the histogram of delivered residuals
    const most = Math.max(1, ...this.bins), bh = plotH / (this.bins.length - 1);
    ctx.fillStyle = tint;
    this.bins.forEach((count, b) => {
      if (!count) return;
      const n = (b / (this.bins.length - 1) * 2 - 1) * R, w = count / most * histW;
      ctx.globalAlpha = 0.75; ctx.fillRect(histL, Y(n) - bh / 2, w, Math.max(1, bh - 0.5));
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted; ctx.textAlign = "left"; ctx.fillText("what lands", histL, top + 12);
    // particles: up from the bell to the curve, then across to the histogram
    for (const p of this.particles) {
      const a = p.age;
      let px, py;
      if (a < 0.5) { px = X(p.t); py = bellTop + bellH - (bellTop + bellH - Y(p.n)) * smooth(a / 0.5); }
      else if (a < 0.62) { px = X(p.t); py = Y(p.n) + (Y(p.d) - Y(p.n)) * smooth((a - 0.5) / 0.12); }
      else { px = X(p.t) + (histL - X(p.t)) * smooth((a - 0.62) / 0.63); py = Y(p.d); }
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = a < 0.5 ? accent : tint; ctx.fill();
    }
    const st = this.stats, mean = st.n ? st.s / st.n : 0, sd = st.n ? Math.sqrt(Math.max(st.s2 / st.n - mean * mean, 0)) : 0;
    $("machineStat").innerHTML = st.n
      ? `${st.n.toLocaleString()} draws at brightness <b>${Math.round(this.x * 255)}</b> (${CH[c]}): spread <b>${sd.toFixed(1)}</b> codes, mean ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}, <b>${(100 * st.clipped / st.n).toFixed(0)}%</b> clipped.`
      : "Particles are on their way…";
  },
};

function initMachine() {
  const slider = $("machineX"), out = $("machineXOut");
  const set = () => {
    machine.x = Number(slider.value) / 255;
    out.textContent = slider.value;
    $("machineSwatch").style.background = `rgb(${slider.value},${slider.value},${slider.value})`;
    machine.reset();
  };
  slider.addEventListener("input", set);
  document.querySelectorAll("#machineChannel button").forEach((b) => b.addEventListener("click", () => {
    machine.channel = Number(b.dataset.c);
    document.querySelectorAll("#machineChannel button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    machine.reset();
  }));
  out.textContent = slider.value;
  $("machineSwatch").style.background = `rgb(${slider.value},${slider.value},${slider.value})`;
  new IntersectionObserver((entries) => {
    machine.visible = entries[0].isIntersecting;
    if (machine.visible) machine.ensure();
  }).observe($("machineCanvas"));
  new ResizeObserver(() => machine.draw()).observe($("machineCanvas"));
}

// ── figure 3: the mixer pad ──────────────────────────────────────────────────────────────

const mixer = { space: null, parts: null, k: null, l: null, field: null, out: null, mode: "image", from: null };

async function initMixer() {
  const sp = manifest.space;
  const buffer = await (await fetch(new URL(sp.file, MANIFEST))).arrayBuffer();
  mixer.space = E.space(sp, buffer);
  $("mixCap").textContent = "Drawing the field…";
  await new Promise((resolve) => setTimeout(resolve, 30));
  mixer.parts = E.fieldParts(mixer.space.kernelMean, mixer.space.kernelComponents, sp.kernel.components, N, N, SEED);
  const start = sp.presets.find((p) => p.id === "sidd:S6_1600") || sp.presets[0];
  load(start);
  const pad = $("mixPad");
  const pick = (event) => {
    const r = pad.getBoundingClientRect(), px = event.clientX - r.left, py = event.clientY - r.top;
    const near = nearest(px, py);
    if (near && near.d < 10) return load(near.preset);
    const { k, l } = fromPad(px, py);
    mixer.k[0] = k; mixer.l[0] = l; mixer.from = null;
    update();
  };
  pad.addEventListener("pointerdown", (event) => { pad.setPointerCapture(event.pointerId); pick(event); });
  pad.addEventListener("pointermove", (event) => {
    if (pad.hasPointerCapture(event.pointerId)) {
      const r = pad.getBoundingClientRect(), { k, l } = fromPad(event.clientX - r.left, event.clientY - r.top);
      mixer.k[0] = k; mixer.l[0] = l; mixer.from = null;
      update();
    } else {
      const r = pad.getBoundingClientRect(), near = nearest(event.clientX - r.left, event.clientY - r.top);
      mixer.hover = near && near.d < 10 ? near.preset : null;
      drawPad();
    }
  });
  pad.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!step) return;
    event.preventDefault();
    mixer.k[0] += step[0]; mixer.l[0] += step[1]; mixer.from = null;
    update();
  });
  document.querySelectorAll("#mixMode button").forEach((b) => b.addEventListener("click", () => {
    mixer.mode = b.dataset.mode;
    document.querySelectorAll("#mixMode button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    update();
  }));
  new ResizeObserver(() => drawPad()).observe(pad);
}

const PAD_K = [-1.2, 0.8], PAD_L = [-17, 23];   // filter PC1 and lookup PC1 ranges, presets inside
function padBox() {
  const pad = $("mixPad"), W = pad.clientWidth, H = pad.clientHeight;
  return { W, H, left: 14, right: W - 14, top: 14, bottom: H - 26 };
}
function toPad(k, l) {
  const b = padBox();
  return [b.left + (k - PAD_K[0]) / (PAD_K[1] - PAD_K[0]) * (b.right - b.left),
          b.bottom - (l - PAD_L[0]) / (PAD_L[1] - PAD_L[0]) * (b.bottom - b.top)];
}
function fromPad(px, py) {
  const b = padBox();
  return { k: PAD_K[0] + clamp01((px - b.left) / (b.right - b.left)) * (PAD_K[1] - PAD_K[0]),
           l: PAD_L[0] + clamp01((b.bottom - py) / (b.bottom - b.top)) * (PAD_L[1] - PAD_L[0]) };
}
function nearest(px, py) {
  let best = null;
  for (const preset of manifest.space.presets) {
    const [x, y] = toPad(preset.kernel[0], preset.lookup[0]), d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { preset, d };
  }
  return best;
}

function load(preset) {
  mixer.k = preset.kernel.slice();
  mixer.l = preset.lookup.slice();
  mixer.from = preset;
  update();
}

let mixFrame = 0;
function update() {
  if (mixFrame) return;
  mixFrame = requestAnimationFrame(() => {
    mixFrame = 0;
    const sp = mixer.space, kernel = E.kernel(sp, mixer.k), g = E.lookup(sp, mixer.l);
    mixer.field = E.mixField(mixer.parts, mixer.k, kernel.scale, mixer.field);
    mixer.out = E.render(cleanRGBA, mixer.field, g, knots, mixer.out);
    const ctx = $("mixOut").getContext("2d"), image = ctx.createImageData(N, N);
    if (mixer.mode === "noise") {
      for (let p = 0; p < N * N; p++) {
        for (let c = 0; c < 3; c++) image.data[4 * p + c] = 128 + 2 * (mixer.out[4 * p + c] - cleanRGBA[4 * p + c]);
        image.data[4 * p + 3] = 255;
      }
    } else image.data.set(mixer.out);
    ctx.putImageData(image, 0, 0);
    drawPad();
    const near = nearest(...toPad(mixer.k[0], mixer.l[0]));
    $("mixCap").innerHTML = mixer.from
      ? `<b>${mixer.from.label}</b>, as its six filter and twelve lookup scores rebuild it.`
      : `Filter PC1 <b>${mixer.k[0].toFixed(2)}</b>, lookup PC1 <b>${mixer.l[0].toFixed(1)}</b>; the other components stay where the last preset left them. Nearest fitted preset: ${near.preset.label}.`;
  });
}

function drawPad() {
  const pad = $("mixPad"), dpr = window.devicePixelRatio || 1, b = padBox();
  if (pad.width !== Math.round(b.W * dpr)) { pad.width = Math.round(b.W * dpr); pad.height = Math.round(b.H * dpr); }
  const ctx = pad.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.W, b.H);
  ctx.strokeStyle = "#d9dcdf"; ctx.lineWidth = 1;
  const [zx, zy] = toPad(0, 0);
  ctx.beginPath(); ctx.moveTo(zx, b.top); ctx.lineTo(zx, b.bottom); ctx.moveTo(b.left, zy); ctx.lineTo(b.right, zy); ctx.stroke();
  ctx.fillStyle = "#5c6266"; ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textAlign = "left"; ctx.fillText("← film grain", b.left, b.H - 8);
  ctx.textAlign = "right"; ctx.fillText("camera noise →", b.right, b.H - 8);
  ctx.save(); ctx.translate(b.right - 2, b.top + 2); ctx.textAlign = "right"; ctx.fillText("stronger ↑", 0, 10); ctx.restore();
  // the 24 fitted presets: SIDD as circles, Newson as triangles, growing with ISO or radius
  const rank = (preset) => {
    const same = manifest.space.presets.filter((p) => p.dataset === preset.dataset).map((p) => p.order).sort((a, z) => a - z);
    return (same.indexOf(preset.order) + 0.5) / same.length;
  };
  for (const preset of manifest.space.presets) {
    const [x, y] = toPad(preset.kernel[0], preset.lookup[0]), r = 3 + 4 * rank(preset);
    ctx.beginPath();
    if (preset.dataset === "sidd") ctx.arc(x, y, r, 0, 2 * Math.PI);
    else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.05, y + r * 0.7); ctx.lineTo(x - r * 1.05, y + r * 0.7); ctx.closePath(); }
    ctx.fillStyle = preset.dataset === "sidd" ? "#2a78d6" : "#eb6834";
    ctx.globalAlpha = mixer.from === preset ? 1 : 0.8; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  }
  if (mixer.hover) {
    const [x, y] = toPad(mixer.hover.kernel[0], mixer.hover.lookup[0]);
    ctx.fillStyle = "#16181a"; ctx.textAlign = x > b.W / 2 ? "right" : "left";
    ctx.fillText(mixer.hover.label, x + (x > b.W / 2 ? -10 : 10), y - 8);
  }
  if (mixer.k) {
    const [x, y] = toPad(mixer.k[0], mixer.l[0]);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI);
    ctx.strokeStyle = "#a85a12"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 2 * Math.PI); ctx.fillStyle = "#a85a12"; ctx.fill();
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────────────────

async function boot() {
  manifest = await (await fetch(MANIFEST)).json();
  knots = manifest.knots;
  cleanRGBA = renderScene(N, N);
  clean = new Float32Array(N * N * 3);
  for (let p = 0; p < N * N; p++) for (let c = 0; c < 3; c++) clean[3 * p + c] = cleanRGBA[4 * p + c] / 255;
  buildTertiles();
  initSteps();
  initMachine();
  await choose(manifest.figure[0].id);
  playTo(4, 0);
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    initMixer().catch((error) => { $("mixCap").textContent = "The mixer could not start: " + error.message; console.error(error); });
  }, { rootMargin: "200px" }).observe($("mixPad"));
  document.body.classList.add("ready");
}

boot().catch((error) => {
  console.error(error);
  $("stepCap").textContent = "The playground could not start: " + error.message;
});
