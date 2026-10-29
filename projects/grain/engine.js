
/* PGNM browser engine for PCA preset spaces (model schema pgnm/5).

   A preset is the space's mean plus score-weighted components, repaired as in
   experiments/pca3/presets.py: each output channel's filter rescaled to unit
   squared energy, each lookup row sorted along the Gaussian axis, then clipped
   to |residual| <= 1. Rendering follows pgnm/model.py: filter independent RGB
   Gaussian noise with kernels[y][x][input][output], evaluate the residual
   lookup bilinearly at (clean intensity, field value), add once and clip.

   Unlike the Python renderer, there is no four-field bank: one latent field of
   the image's size is drawn per image, by the same "valid" convolution of an
   (h+24)×(w+24) noise array (overlap-save FFT blocks; browser RNG). Because
   convolution is linear, the field is kept as one part per filter component;
   moving a filter slider only re-weights the parts. */
'use strict';
const PGNMEngine = (() => {
  const KH = 25, KW = 25, C = 3, I = 256, T = 25;
  const KERNEL_SIZE = KH * KW * C * C, LOOKUP_SIZE = C * I * T;

  function space(entry, buffer) {
    const data = new Float32Array(buffer);
    if (data.length !== entry.floats) throw Error('Basis file has an unexpected size: ' + entry.file);
    let offset = 0;
    const take = n => { const view = data.subarray(offset, offset + n); offset += n; return view; };
    return Object.assign({}, entry, {
      kernelMean: take(KERNEL_SIZE), kernelComponents: take(entry.kernel.components * KERNEL_SIZE),
      lookupMean: take(LOOKUP_SIZE), lookupComponents: take(entry.lookup.components * LOOKUP_SIZE)});
  }

  function combine(mean, components, scores, size) {
    const out = Float64Array.from(mean);
    scores.forEach((score, k) => {
      if (!score) return;
      const base = k * size;
      for (let i = 0; i < size; i++) out[i] += score * components[base + i];
    });
    return out;
  }

  /* Unit-energy filter; layout (y, x, input, output) in C order, so i % 3 is the output. */
  function kernel(sp, scores) {
    const k = combine(sp.kernelMean, sp.kernelComponents, scores, KERNEL_SIZE);
    const energy = [0, 0, 0];
    for (let i = 0; i < KERNEL_SIZE; i++) energy[i % C] += k[i] * k[i];
    if (energy.some(e => !(e > 0))) throw Error('A filter output channel has no energy.');
    const scale = energy.map(e => 1 / Math.sqrt(e));
    for (let i = 0; i < KERNEL_SIZE; i++) k[i] *= scale[i % C];
    return { kernel: k, energy, scale };
  }

  /* Monotone, bounded lookup; layout (channel, intensity, knot). */
  function lookup(sp, scores) {
    const g = combine(sp.lookupMean, sp.lookupComponents, scores, LOOKUP_SIZE);
    const row = new Float64Array(T);
    for (let r = 0; r < C * I; r++) {
      const base = r * T;
      for (let t = 0; t < T; t++) row[t] = g[base + t];
      row.sort();
      for (let t = 0; t < T; t++) g[base + t] = Math.min(1, Math.max(-1, row[t]));
    }
    return g;
  }

  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(seed) {
    const uniform = rng(seed);
    let spare = null;
    return () => {
      if (spare !== null) { const z = spare; spare = null; return z; }
      const radius = Math.sqrt(-2 * Math.log(Math.max(uniform(), 1e-12))), angle = 2 * Math.PI * uniform();
      spare = radius * Math.sin(angle);
      return radius * Math.cos(angle);
    };
  }

  const plans = new Map();
  function plan(n) {
    if (plans.has(n)) return plans.get(n);
    const bits = Math.log2(n), reverse = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n; i++) {
      let x = i, r = 0;
      for (let j = 0; j < bits; j++) { r = (r << 1) | (x & 1); x >>>= 1; }
      reverse[i] = r;
    }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    const p = { reverse, cos, sin };
    plans.set(n, p);
    return p;
  }

  /* Radix-2 FFT of n contiguous values at offset; sign -1 forward, +1 inverse (unscaled). */
  function fft1(re, im, offset, n, sign) {
    const p = plan(n), reverse = p.reverse, cos = p.cos, sin = p.sin, end = offset + n;
    for (let i = 0; i < n; i++) {
      const j = reverse[i];
      if (j > i) {
        const a = offset + i, b = offset + j;
        let t = re[a]; re[a] = re[b]; re[b] = t;
        t = im[a]; im[a] = im[b]; im[b] = t;
      }
    }
    for (let length = 2; length <= n; length <<= 1) {
      const half = length >> 1, step = n / length;
      for (let j = 0; j < half; j++) {
        const wr = cos[j * step], wi = sign * sin[j * step];
        for (let a = offset + j; a < end; a += length) {
          const b = a + half, tr = wr * re[b] - wi * im[b], ti = wr * im[b] + wi * re[b];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  const scratch = new Map();
  function transpose(values, h, w) {  // h×w row-major to w×h row-major, in place via scratch
    let buffer = scratch.get(values.length);
    if (!buffer) { buffer = new Float64Array(values.length); scratch.set(values.length, buffer); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buffer[x * h + y] = values[y * w + x];
    values.set(buffer);
  }

  /* In-place 2D FFT (inverse scaled by 1/(h·w)). Rows that are entirely zero are skipped in
     the first pass (filters have 25 nonzero rows); columns are transformed as rows of the
     transpose so that every 1D transform reads contiguous memory. */
  function fft2(re, im, h, w, inverse = false) {
    const sign = inverse ? 1 : -1;
    for (let y = 0; y < h; y++) {
      const base = y * w;
      let nonzero = false;
      for (let x = 0; x < w && !nonzero; x++) nonzero = re[base + x] !== 0 || im[base + x] !== 0;
      if (nonzero) fft1(re, im, base, w, sign);
    }
    transpose(re, h, w); transpose(im, h, w);
    for (let x = 0; x < w; x++) fft1(re, im, x * h, h, sign);
    transpose(re, w, h); transpose(im, w, h);
    if (inverse) {
      const scale = 1 / (h * w);
      for (let i = 0; i < h * w; i++) { re[i] *= scale; im[i] *= scale; }
    }
  }

  /* Spectra of two real h×w arrays from one complex FFT (a + i b), by Hermitian symmetry. */
  function fftReal2(re, im, h, w) {
    fft2(re, im, h, w);
    const n = h * w, ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
    for (let y = 0; y < h; y++) {
      const ny = (h - y) % h;
      for (let x = 0; x < w; x++) {
        const k = y * w + x, m = ny * w + (w - x) % w;
        const xr = re[k], xi = im[k], yr = re[m], yi = im[m];
        ar[k] = (xr + yr) / 2; ai[k] = (xi - yi) / 2;
        br[k] = (xi + yi) / 2; bi[k] = (yr - xr) / 2;
      }
    }
    return [[ar, ai], [br, bi]];
  }

  const BLOCK = 128, VALID = BLOCK - KH + 1;  // overlap-save blocks: 104×104 valid outputs each

  /* Spectra of every filter slice on the block grid: spectra[j][input][output] = [re, im],
     j = 0 for the mean filter and j = 1..components for the components. */
  function kernelSpectra(kernelMean, kernelComponents, components) {
    const n = BLOCK * BLOCK, spectra = [];
    for (let j = 0; j <= components; j++) {
      const source = j === 0 ? kernelMean : kernelComponents.subarray((j - 1) * KERNEL_SIZE, j * KERNEL_SIZE);
      const slices = [], bySlice = [[], [], []];
      for (let input = 0; input < C; input++) for (let output = 0; output < C; output++) slices.push([input, output]);
      for (let s = 0; s < slices.length; s += 2) {
        const pair = slices.slice(s, s + 2), re = new Float64Array(n), im = new Float64Array(n);
        pair.forEach(([input, output], half) => {
          const target = half ? im : re;
          for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++)
            target[y * BLOCK + x] = source[((y * KW + x) * C + input) * C + output];
        });
        const transformed = fftReal2(re, im, BLOCK, BLOCK);
        pair.forEach(([input, output], half) => { bySlice[input][output] = transformed[half]; });
      }
      spectra.push(bySlice);
    }
    return spectra;
  }

  /* Field parts for the mean filter and each filter component: parts[j][output] is an h×w
     Float32Array of independent noise convolved with component j's slices for that output,
     in "valid" mode on an (h+24)×(w+24) noise array, as pgnm/model.py builds one field. */
  /* Independent noise rows [first, first + count) of an image of width w: row r comes from its
     own seeded generator, so stripes of one field can be drawn by separate workers. */
  function noiseRows(seed, first, count, w) {
    const nw = w + KW - 1, noise = [0, 1, 2].map(() => new Float32Array(count * nw));
    for (let r = 0; r < count; r++) {
      let key = Math.imul((seed >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(first + r + 1, 0xC2B2AE35);
      key = Math.imul(key ^ (key >>> 16), 0x7FEB352D);
      const draw = normal(key ^ (key >>> 15));
      for (let x = 0; x < nw; x++) for (let c = 0; c < C; c++) noise[c][r * nw + x] = draw();
    }
    return noise;
  }

  /* Field rows [first, first + h) of an image of width w (first = 0, h = image height for
     the whole field); noise may be given per channel as (h+24)×(w+24) arrays. */
  function fieldParts(kernelMean, kernelComponents, components, h, w, seed, progress = () => {}, spectra = null,
                      noise = null, first = 0) {
    spectra = spectra || kernelSpectra(kernelMean, kernelComponents, components);
    const nh = h + KH - 1, nw = w + KW - 1;
    noise = noise || noiseRows(seed, first, nh, w);
    const parts = spectra.map(() => [0, 1, 2].map(() => new Float32Array(h * w)));
    const n = BLOCK * BLOCK, re = new Float64Array(n), im = new Float64Array(n);
    const z = [0, 1, 2].map(() => [new Float64Array(n), new Float64Array(n)]);
    const rows = Math.ceil(h / VALID), cols = Math.ceil(w / VALID);
    for (let by = 0; by < rows; by++) for (let bx = 0; bx < cols; bx++) {
      const oy = by * VALID, ox = bx * VALID;
      // Noise spectra of this block: channels 0 and 1 packed in one FFT, channel 2 alone.
      for (const [first, second] of [[0, 1], [2, -1]]) {
        re.fill(0); im.fill(0);
        for (let y = 0; y < BLOCK && oy + y < nh; y++) for (let x = 0; x < BLOCK && ox + x < nw; x++) {
          const k = y * BLOCK + x, source = (oy + y) * nw + ox + x;
          re[k] = noise[first][source];
          if (second >= 0) im[k] = noise[second][source];
        }
        fft2(re, im, BLOCK, BLOCK);
        if (second < 0) { z[first][0].set(re); z[first][1].set(im); continue; }
        for (let y = 0; y < BLOCK; y++) {
          const ny = (BLOCK - y) % BLOCK;
          for (let x = 0; x < BLOCK; x++) {
            const k = y * BLOCK + x, m = ny * BLOCK + (BLOCK - x) % BLOCK;
            const xr = re[k], xi = im[k], yr = re[m], yi = im[m];
            z[first][0][k] = (xr + yr) / 2; z[first][1][k] = (xi - yi) / 2;
            z[second][0][k] = (xi + yi) / 2; z[second][1][k] = (yr - xr) / 2;
          }
        }
      }
      const vh = Math.min(VALID, h - oy), vw = Math.min(VALID, w - ox);
      spectra.forEach((bySlice, j) => {
        // Outputs 0 and 1 back in one inverse FFT of F0 + i F1 (both real), output 2 alone.
        for (const [first, second] of [[0, 1], [2, -1]]) {
          re.fill(0); im.fill(0);
          for (const [output, sign] of [[first, 1], [second, -1]]) {
            if (output < 0) continue;
            for (let input = 0; input < C; input++) {
              const [kr, ki] = bySlice[input][output], [zr, zi] = z[input];
              if (sign > 0) {
                for (let i = 0; i < n; i++) { re[i] += zr[i] * kr[i] - zi[i] * ki[i]; im[i] += zr[i] * ki[i] + zi[i] * kr[i]; }
              } else {  // i * (a + i b) = -b + i a
                for (let i = 0; i < n; i++) { re[i] -= zr[i] * ki[i] + zi[i] * kr[i]; im[i] += zr[i] * kr[i] - zi[i] * ki[i]; }
              }
            }
          }
          fft2(re, im, BLOCK, BLOCK, true);
          for (const [output, values] of [[first, re], [second, im]]) {
            if (output < 0) continue;
            const target = parts[j][output];
            for (let y = 0; y < vh; y++) {
              const from = (y + KH - 1) * BLOCK + KW - 1, to = (oy + y) * w + ox;
              for (let x = 0; x < vw; x++) target[to + x] = values[from + x];
            }
          }
        }
      });
      progress((by * cols + bx + 1) / (rows * cols));
    }
    return parts;
  }

  /* Interleaved h×w×3 latent field from the parts, the filter scores and the energy scale. */
  function mixField(parts, scores, scale, out) {
    const size = parts[0][0].length, field = out || new Float32Array(size * C);
    const weights = [1, ...scores.slice(0, parts.length - 1)];
    for (let c = 0; c < C; c++) {
      const terms = parts.map((part, j) => [part[c], weights[j] * scale[c]]).filter(([, weight]) => weight !== 0);
      for (let p = 0; p < size; p++) {
        let value = 0;
        for (const [values, weight] of terms) value += weight * values[p];
        field[p * C + c] = value;
      }
    }
    return field;
  }

  /* Noisy RGBA from clean RGBA, the interleaved field and the lookup, as pgnm/model.py. */
  function render(clean, field, g, knots, out) {
    const pixels = clean.length / 4, start = knots[0], step = knots[1] - knots[0];
    const result = out || new Uint8ClampedArray(clean.length);
    for (let p = 0; p < pixels; p++) {
      for (let c = 0; c < C; c++) {
        const value = clean[p * 4 + c] / 255;
        const ip = Math.min(Math.max(value, 0), 1) * (I - 1);
        const ii = Math.min(Math.floor(ip), I - 2), iw = ip - ii;
        const gp = (field[p * C + c] - start) / step;
        const gi = Math.min(Math.max(Math.floor(gp), 0), T - 2), gw = gp - gi;
        const a = (c * I + ii) * T + gi, b = a + T;
        const lower = g[a] + gw * (g[a + 1] - g[a]), upper = g[b] + gw * (g[b + 1] - g[b]);
        const noisy = Math.min(Math.max(value + lower + iw * (upper - lower), 0), 1);
        result[p * 4 + c] = Math.floor(noisy * 255 + 0.5);
      }
      result[p * 4 + 3] = clean[p * 4 + 3];
    }
    return result;
  }

  /* A pgnm/5 preset that the Python renderer accepts (pgnm.load / pgnm.validate). */
  function preset(sp, kernelScores, lookupScores, knots, note) {
    const k = kernel(sp, kernelScores).kernel, g = lookup(sp, lookupScores);
    const kernels = [], table = [];
    for (let y = 0; y < KH; y++) {
      const row = [];
      for (let x = 0; x < KW; x++) {
        const tap = [];
        for (let input = 0; input < C; input++)
          tap.push(Array.from(k.subarray(((y * KW + x) * C + input) * C, ((y * KW + x) * C + input + 1) * C)));
        row.push(tap);
      }
      kernels.push(row);
    }
    for (let c = 0; c < C; c++) {
      const rows = [];
      for (let i = 0; i < I; i++) rows.push(Array.from(g.subarray((c * I + i) * T, (c * I + i + 1) * T)));
      table.push(rows);
    }
    return {
      schema: 'pgnm/5', method: 'ours', name: 'PGNM', kernels,
      marginal: { t: Array.from(knots), g: table, step: 1.0 },
      provenance: { frontend: Object.assign({ space: sp.id, kernel_scores: kernelScores, lookup_scores: lookupScores,
        repairs: 'unit filter energy per output; lookup rows sorted along t; clipped to |residual| <= 1' }, note || {}) }
    };
  }

  return { KERNEL_SIZE, LOOKUP_SIZE, VALID, space, kernel, lookup, normal, fft2, kernelSpectra, noiseRows,
           fieldParts, mixField, render, preset };
})();
if (typeof module !== 'undefined') module.exports = PGNMEngine;