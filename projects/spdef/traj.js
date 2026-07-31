// Trajectory bundle: fetch, dequantise, and evaluate the fitted spline.
//
// This file MIRRORS build_point_bundle.py / point_deform.DefPointsExplicitSplines:
//   `decodeComponent`<-> traj_codec.dequantize
//   `knotBracket`    <-> build_point_bundle.knot_bracket / _query_knots
//   `curveBasis`     <-> build_point_bundle.curve_basis / modules/curves.py
//   `evaluate`       <-> build_point_bundle.evaluate
// A divergence silently deforms the geometry, so meta.json ships a parity block
// (torch-computed positions for a few frames/points) and `checkParity` verifies it
// on load — the same contract player_browser has with compression/decoder.py.
// tests/test_traj_parity.py runs the same check headlessly under node.

const QUANT_MAX = { u8: 255, u16: 65535 };

// IEEE half -> float. No Float16Array in browsers (and DataView.getFloat16 is too new
// to rely on), so decode the bits directly. Mirrors numpy's `.astype('<f2')` round-trip.
export function halfToFloat(h) {
  const sign = (h & 0x8000) ? -1 : 1, exponent = (h & 0x7C00) >> 10, mantissa = h & 0x03FF;
  if (exponent === 0) return sign * 6.103515625e-5 * (mantissa / 1024);   // subnormal
  if (exponent === 0x1F) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

// One knot array -> Float32. `u8`/`u16` are integer codes over a per-axis range; `f16`
// carries the value itself and ignores the range. Mirrors traj_codec.dequantize.
export function decodeComponent(codes, dtype, mins, maxs, out) {
  const n = codes.length;
  out = out || new Float32Array(n);
  if (dtype === 'f16') {
    for (let i = 0; i < n; i++) out[i] = halfToFloat(codes[i]);
    return out;
  }
  const qmax = QUANT_MAX[dtype];
  if (!qmax) throw new Error(`unknown knot dtype: ${dtype}`);
  const span = [0, 1, 2].map(c => (maxs[c] > mins[c] ? maxs[c] - mins[c] : 1.0));
  for (let i = 0; i < n; i += 3) {
    out[i] = (codes[i] / qmax) * span[0] + mins[0];
    out[i + 1] = (codes[i + 1] / qmax) * span[1] + mins[1];
    out[i + 2] = (codes[i + 2] / qmax) * span[2] + mins[2];
  }
  return out;
}

export function knotBracket(timestep, numIntervals) {
  // Mirror of DefPointsExplicitSplines._query_knots. The clamp at 0 is the one
  // addition: the page can scrub to exactly 0, where Python only ever gets t >= 0.
  let left = Math.floor(timestep * numIntervals);
  if (left >= numIntervals) left -= 1;
  if (left < 0) left = 0;
  return { left, right: left + 1, tRel: timestep * numIntervals - left };
}

export function curveBasis(curve, t) {
  const t2 = t * t, t3 = t2 * t;
  if (curve === 'cubic_hermite') {
    // [p0, m0, p1, m1]
    return [2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2];
  }
  const t4 = t3 * t, t5 = t4 * t;
  // [p0, m0, a0, p1, m1, a1]
  return [
    -6 * t5 + 15 * t4 - 10 * t3 + 1,
    -3 * t5 + 8 * t4 - 6 * t3 + t,
    -0.5 * t5 + 1.5 * t4 - 1.5 * t3 + 0.5 * t2,
    6 * t5 - 15 * t4 + 10 * t3,
    -3 * t5 + 7 * t4 - 4 * t3,
    0.5 * t5 - t4 + 0.5 * t3,
  ];
}

// Positions at `timestep` into `out`; false when a bracketing knot is not resident.
export function evaluate(bundle, timestep, out) {
  const { left, right, tRel } = knotBracket(timestep, bundle.meta.num_intervals);
  const L = bundle.knot(left), R = bundle.knot(right);
  if (!L || !R) return false;

  const w = curveBasis(bundle.meta.curve, tRel);
  const canonical = bundle.canonical, n = canonical.length;
  if (bundle.meta.curve === 'cubic_hermite') {
    const [w0, w1, w2, w3] = w, ld = L.d_xyz, lv = L.v_xyz, rd = R.d_xyz, rv = R.v_xyz;
    for (let i = 0; i < n; i++) {
      out[i] = canonical[i] + w0 * ld[i] + w1 * lv[i] + w2 * rd[i] + w3 * rv[i];
    }
  } else {
    const [w0, w1, w2, w3, w4, w5] = w;
    const ld = L.d_xyz, lv = L.v_xyz, la = L.a_xyz, rd = R.d_xyz, rv = R.v_xyz, ra = R.a_xyz;
    for (let i = 0; i < n; i++) {
      out[i] = canonical[i] + w0 * ld[i] + w1 * lv[i] + w2 * la[i]
                            + w3 * rd[i] + w4 * rv[i] + w5 * ra[i];
    }
  }
  return true;
}

// Same curve, evaluated for a subset of points: `out[j]` is `indices[j]`. Trails need
// a few hundred samples per frame but only ~1500 of the points, so evaluating the full
// set per sample is ~20x wasted work (and memory traffic) on a 30k-point mesh.
export function evaluateSubset(bundle, timestep, indices, out, outOffset = 0) {
  const { left, right, tRel } = knotBracket(timestep, bundle.meta.num_intervals);
  const L = bundle.knot(left), R = bundle.knot(right);
  if (!L || !R) return false;

  const w = curveBasis(bundle.meta.curve, tRel);
  const canonical = bundle.canonical;
  const cubic = bundle.meta.curve === 'cubic_hermite';
  const [w0, w1, w2, w3, w4, w5] = w;
  const ld = L.d_xyz, lv = L.v_xyz, rd = R.d_xyz, rv = R.v_xyz;
  const la = cubic ? null : L.a_xyz, ra = cubic ? null : R.a_xyz;

  let o = outOffset;
  for (let j = 0; j < indices.length; j++) {
    const b = indices[j] * 3;
    for (let c = 0; c < 3; c++) {
      const i = b + c;
      out[o++] = cubic
        ? canonical[i] + w0 * ld[i] + w1 * lv[i] + w2 * rd[i] + w3 * rv[i]
        : canonical[i] + w0 * ld[i] + w1 * lv[i] + w2 * la[i]
                       + w3 * rd[i] + w4 * rv[i] + w5 * ra[i];
    }
  }
  return true;
}

// Frame at which knot k sits: its time is k / num_intervals, and t = frame / denominator.
export function knotFrame(meta, k) {
  return k * meta.timestep_denominator / meta.num_intervals;
}

// Sample frames for a trail over [from, to]: `samplesPerFrame` uniform samples plus, when
// `includeKnots`, the exact knot frames inside the window. Sorted and deduped, so every
// consecutive pair lies wholly inside one knot interval — which is what lets the page
// colour each segment by its interval and put the colour change exactly on the knot.
export function trailSampleFrames(bundle, from, to, samplesPerFrame, includeKnots = true, maxSamples = 320) {
  const window = to - from;
  if (!(window > 0)) return [];
  const uniform = Math.min(maxSamples, Math.max(2, Math.round(window * samplesPerFrame) + 1));
  const frames = [];
  for (let s = 0; s < uniform; s++) frames.push(from + window * (s / (uniform - 1)));
  if (includeKnots) {
    for (const k of bundle.meta.knot_ids) {
      const at = knotFrame(bundle.meta, k);
      if (at > from + 1e-6 && at < to - 1e-6) frames.push(at);
    }
    frames.sort((a, b) => a - b);
  }
  return frames.filter((frame, i) => i === 0 || frame - frames[i - 1] > 1e-9);
}

// The knot interval a frame falls in — the index the page colours a trail segment by.
export function intervalOf(bundle, frame) {
  return knotBracket(bundle.timestep(frame), bundle.meta.num_intervals).left;
}

// f16 arrives as raw 16-bit words and is converted in decodeComponent.
const TYPED = { u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, f16: Uint16Array };

export class TrajectoryBundle {
  // Knots are one file each, fetched on demand: a long sequence is ~100 knots x
  // ~0.2 MB per component, far too much to load up front, but only the two
  // bracketing the playhead are ever needed to draw a frame.
  constructor(meta, baseUrl, fetchFn = null) {
    this.meta = meta;
    this.baseUrl = baseUrl;
    // Bind to the global. Stored on `this`, the browser's fetch would be invoked as
    // `this.fetchFn(url)` — i.e. with `this === bundle` — which Firefox rejects with
    // "'fetch' called on an object that does not implement interface Window".
    this.fetchFn = fetchFn || globalThis.fetch.bind(globalThis);
    this.components = Object.keys(meta.components);
    this.cache = new Map();     // knot id -> {d_xyz, v_xyz[, a_xyz]} Float32Array
    this.pending = new Map();   // knot id -> Promise
    this.failures = new Map();  // knot id -> attempts; caps retries (see request)
    this.cacheLimit = 48;   // ~0.75 MB decoded per knot; covers the longest trail window
    this.maxAttempts = 3;
    this.bytesFetched = 0;
    this.lastError = null;
  }

  static async load(metaUrl, fetchFn = null) {
    const doFetch = fetchFn || globalThis.fetch.bind(globalThis);
    const meta = await (await doFetch(metaUrl)).json();
    const bundle = new TrajectoryBundle(meta, metaUrl.replace(/[^/]*$/, ''), doFetch);
    await bundle.loadEager();
    return bundle;
  }

  // meta.version is a hash of the bundle's metadata, so re-exporting the same scene in
  // a different format changes every binary's URL. Without it the browser happily serves
  // cached u16 bytes against an f16 meta, and half-decoding integer codes yields NaN for
  // any word whose exponent bits are all 1 (~1.5% of them).
  binaryUrl(file) {
    return this.baseUrl + file + (this.meta.version ? `?v=${this.meta.version}` : '');
  }

  async fetchArray(entry, TypedArrayCtor) {
    const response = await this.fetchFn(this.binaryUrl(entry.file));
    if (!response.ok) throw new Error(`${entry.file}: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength % TypedArrayCtor.BYTES_PER_ELEMENT !== 0) {
      throw new Error(`${entry.file}: ${buffer.byteLength} bytes is not a whole number of ` +
                      `${TypedArrayCtor.name} elements — truncated or wrong dtype`);
    }
    this.bytesFetched += buffer.byteLength;
    return new TypedArrayCtor(buffer);
  }

  // Decoded knots must be finite. A NaN here means the bytes are not what meta.json says
  // they are (almost always a stale cache), and it would otherwise propagate silently
  // through the curve into the geometry.
  static assertFinite(values, label) {
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) {
        throw new Error(`${label} decoded to ${values[i]} at element ${i} — the bytes do not ` +
                        `match meta.json (stale browser cache? try a hard reload)`);
      }
    }
    return values;
  }

  async loadEager() {
    const arrays = this.meta.arrays;
    const canonicalCodes = await this.fetchArray(arrays.canonical, TYPED[arrays.canonical.dtype]);
    this.canonical = decodeComponent(
      canonicalCodes, arrays.canonical.dtype, arrays.canonical.min, arrays.canonical.max);

    if (arrays.faces) {
      this.faces = await this.fetchArray(arrays.faces, TYPED[arrays.faces.dtype]);
    }
    if (arrays.gt) {
      const gtCodes = await this.fetchArray(arrays.gt, TYPED[arrays.gt.dtype]);
      this.gt = decodeComponent(gtCodes, arrays.gt.dtype, arrays.gt.min, arrays.gt.max);
      this.gtFrames = arrays.gt.frames;
    }
  }

  timestep(frame) {
    // Mirror of AnimeVerticesDataset.timestep: frame / num_frames, NOT / (n - 1).
    return frame / this.meta.timestep_denominator;
  }

  knot(id) {
    const hit = this.cache.get(id);
    if (hit) return hit;
    this.request(id);
    return null;
  }

  request(id) {
    if (this.cache.has(id) || this.pending.has(id)) return this.pending.get(id) || Promise.resolve();
    // Give up after maxAttempts. A knot that keeps failing used to be re-requested on
    // every animation frame — a GET storm that also buried the real error.
    if ((this.failures.get(id) || 0) >= this.maxAttempts) return Promise.resolve();
    const knots = this.components.map(name => this.meta.components[name].knots[String(id)]);
    if (knots.some(entry => !entry)) return Promise.resolve();  // outside the exported range

    const promise = Promise.all(this.components.map(async (name, index) => {
      const component = this.meta.components[name];
      const codes = await this.fetchArray(knots[index], TYPED[component.dtype]);
      const values = decodeComponent(codes, component.dtype, knots[index].min, knots[index].max);
      return [name, TrajectoryBundle.assertFinite(values, `knot ${id} ${name} (${component.dtype})`)];
    })).then(entries => {
      this.cache.set(id, Object.fromEntries(entries));
      this.pending.delete(id);
      this.failures.delete(id);
      this.evict();
    }).catch(error => {
      this.pending.delete(id);
      const attempts = (this.failures.get(id) || 0) + 1;
      this.failures.set(id, attempts);
      this.lastError = `${error.message}` + (attempts >= this.maxAttempts ? ' (gave up)' : '');
      console.error(`[traj] knot ${id} attempt ${attempts}/${this.maxAttempts}:`, error);
    });
    this.pending.set(id, promise);
    return promise;
  }

  // Keep every knot the *visible window* needs resident — the playhead plus however far
  // back the trail reaches. Prefetching only around the playhead left the oldest trail
  // samples unevaluatable, which is worse than it sounds: the trail is built from the
  // oldest sample forward.
  prefetch(fromFrame, toFrame, ahead = 2) {
    const first = knotBracket(this.timestep(fromFrame), this.meta.num_intervals).left;
    const last = knotBracket(this.timestep(toFrame), this.meta.num_intervals).left;
    this.lastCentre = last;
    for (let id = first - 1; id <= last + 1 + ahead; id++) this.request(id);
    return { first, last };
  }

  // How many of the knots spanning [fromFrame, toFrame] are resident — surfaced in the
  // HUD so a short trail reads as "still loading", not as a bug.
  residentSpan(fromFrame, toFrame) {
    const first = knotBracket(this.timestep(fromFrame), this.meta.num_intervals).left;
    const last = knotBracket(this.timestep(toFrame), this.meta.num_intervals).left + 1;
    let have = 0, need = 0;
    for (let id = first; id <= last; id++) {
      if (this.meta.components[this.components[0]].knots[String(id)]) {
        need++;
        if (this.cache.has(id)) have++;
      }
    }
    return { have, need };
  }

  evict() {
    if (this.cache.size <= this.cacheLimit) return;
    const centre = this.lastCentre ?? 0;
    const byDistance = [...this.cache.keys()].sort((a, b) => Math.abs(b - centre) - Math.abs(a - centre));
    while (this.cache.size > this.cacheLimit) this.cache.delete(byDistance.shift());
  }

  get loading() { return this.pending.size; }

  gtIndexFor(frame) {
    if (!this.gtFrames) return -1;
    let best = -1, bestDistance = Infinity;
    for (let i = 0; i < this.gtFrames.length; i++) {
      const distance = Math.abs(this.gtFrames[i] - frame);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    return bestDistance <= 0.5 ? best : -1;
  }

  // Recompute the torch-computed samples in meta.parity.
  // Returns {ok, maxError, tolerance, checked, skipped}. A frame whose knots failed to
  // load counts as *skipped* and fails the check: silently skipping it would let a
  // corrupt bundle report "parity ok" simply because the bad knot was never read.
  async checkParity() {
    const parity = this.meta.parity;
    if (!parity) return { ok: true, maxError: 0, tolerance: 0, checked: 0, skipped: 0 };
    const positions = new Float32Array(this.canonical.length);
    let maxError = 0, checked = 0, skipped = 0;
    for (let row = 0; row < parity.frames.length; row++) {
      const timestep = this.timestep(parity.frames[row]);
      const { left, right } = knotBracket(timestep, this.meta.num_intervals);
      await Promise.all([this.request(left), this.request(right)]);
      if (!evaluate(this, timestep, positions)) { skipped++; continue; }
      parity.point_indices.forEach((point, column) => {
        for (let c = 0; c < 3; c++) {
          maxError = Math.max(maxError, Math.abs(positions[point * 3 + c] - parity.expected[row][column][c]));
        }
        checked++;
      });
    }
    const ok = skipped === 0 && checked > 0 && maxError <= parity.tolerance;
    return { ok, maxError, tolerance: parity.tolerance, checked, skipped };
  }
}
