// knot_decode.js
// --------------
// In-browser decode of a **knot bundle** (scripts/compress/compress_knot_bundle.py).
//
// A knot bundle does not store one image per frame. It stores one image per spline
// KNOT — the value and the tangent the deformation field holds there — and the player
// reconstructs any timestep as a cubic-Hermite (or quintic) blend of the two knots
// bracketing it. So this module has no streaming window and no per-frame work: it
// decodes the whole (tiny) knot set once, and evaluating a timestep is four multiply-adds
// per Gaussian.
//
// Mirrors, and must stay in lockstep with:
//   curveBasis   <-> web/player_points/traj_codec.py `curve_basis`, modules/curves.py
//   knotBracket  <-> traj_codec.py `knot_bracket`, gs_deform `get_knots_from_timestep`
//   dequant      <-> compression/offset_stream.py `_decompress_png16` / `_decompress_png8`
//   evaluate     <-> the Decode block in compress_knot_bundle.py's module docstring
//
// The reference keyframe (reference.npz) is byte-identical to a frame bundle's, so it is
// decoded by player_browser/decode.js unchanged — this module only handles the streams.
//
// ---------------------------------------------------------------------------------------
// COPIED from 4d-relight/web/player_knots/knot_decode.js. Re-copy it whole rather than
// editing it here, exactly as traj.js is re-copied: `tests/test_knot_parity.py` upstream is
// what ties `dequant*` and `blendKnots` to compression/offset_stream.py, and a divergent copy
// renders motion the model never predicted while still looking like motion.
//
// The ONE deliberate change is the three vendor specifiers below: `../player_browser/vendor/`
// upstream, `../smv/vendor/` here. They are reached only by this module's own ffmpegReady(),
// which serves the standalone knotsplat.html fallback; hosted, the SpDef page hands
// decodeKnotChunk() the ffmpeg instance from ../smv/decode_motion.js so there is never a
// second ~32 MB core on the page.
// ---------------------------------------------------------------------------------------
//
// ffmpeg.wasm is loaded through a DYNAMIC import, not a top-level one, so the maths in
// this file (dequantisation, the curve) can be imported by `knot_node.mjs` under node —
// which has no `Blob`/`Worker` and would die on the vendor module graph. That is what
// makes `tests/test_knot_parity.py` able to run the page's real decode headlessly.

// ── ffmpeg.wasm ─────────────────────────────────────────────────────────────
// Same wasm core as player_browser (its service worker has usually cached it already).
// Resolved against THIS module's URL, not the page's, so the viewer works from any mount.
let _ff = null, _loading = null, _coreURLs = null;
async function coreURLs(toBlobURL) {
  if (_coreURLs) return _coreURLs;
  const u = (p) => new URL(`../smv/vendor/core/${p}`, import.meta.url).href;
  _coreURLs = {
    coreURL: await toBlobURL(u('ffmpeg-core.js'), 'text/javascript'),
    wasmURL: await toBlobURL(u('ffmpeg-core.wasm'), 'application/wasm'),
  };
  return _coreURLs;
}

export function ffmpegReady(onLog) {
  if (_ff) return Promise.resolve(_ff);
  if (_loading) return _loading;
  _loading = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('../smv/vendor/ffmpeg/index.js'),
      import('../smv/vendor/util/index.js'),
    ]);
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    await ff.load(await coreURLs(toBlobURL));
    _ff = ff; return ff;
  })();
  _loading.catch(() => { _loading = null; });
  return _loading;
}

let _ctr = 0;
// .mkv -> rgb24 (F*H*W*3). Codec-agnostic: knot bundles default to FFV1 (lossless —
// libx265 -crf 0 is NOT, and mangles the low byte of the 16-bit planes), but an
// x265-encoded bundle decodes through the identical call.
async function decodeVideo(ff, bytes) {
  const inN = `k${_ctr}.mkv`, outN = `k${_ctr}.rgb`; _ctr++;
  try {
    // writeFile transfers (and detaches) the buffer, so hand it a copy — the caller keeps
    // the fetched bytes around for a re-decode after an ffmpeg reset.
    await ff.writeFile(inN, bytes.slice());
    await ff.exec(['-i', inN, '-f', 'rawvideo', '-pix_fmt', 'rgb24', outN]);
    return await ff.readFile(outN);
  } finally {
    try { await ff.deleteFile(inN); } catch (e) {}
    try { await ff.deleteFile(outN); } catch (e) {}
  }
}

// ── the curve ───────────────────────────────────────────────────────────────

export function curveBasis(curve, t) {
  if (curve === 'cubic_hermite') {
    return [                                   // [p0, m0, p1, m1]
      2 * t ** 3 - 3 * t ** 2 + 1,
      t ** 3 - 2 * t ** 2 + t,
      -2 * t ** 3 + 3 * t ** 2,
      t ** 3 - t ** 2,
    ];
  }
  return [                                     // quintic: [p0, m0, a0, p1, m1, a1]
    -6 * t ** 5 + 15 * t ** 4 - 10 * t ** 3 + 1,
    -3 * t ** 5 + 8 * t ** 4 - 6 * t ** 3 + t,
    -0.5 * t ** 5 + 1.5 * t ** 4 - 1.5 * t ** 3 + 0.5 * t ** 2,
    6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3,
    -3 * t ** 5 + 7 * t ** 4 - 4 * t ** 3,
    0.5 * t ** 5 - t ** 4 + 0.5 * t ** 3,
  ];
}

// Which (component, side) each basis weight multiplies, in basis order.
export function curveOrder(curve, left, right) {
  const comps = curve === 'cubic_hermite' ? ['d', 'v'] : ['d', 'v', 'a'];
  return [...comps.map(c => [c, left]), ...comps.map(c => [c, right])];
}

// The bracketing knot pair and the local parameter, exactly as the trained field does it.
// The extra clamp at 0 is the page's: it can scrub to exactly 0, where training never goes.
export function knotBracket(t, numIntervals) {
  let left = Math.floor(t * numIntervals);
  if (left >= numIntervals) left -= 1;
  if (left < 0) left = 0;
  return [left, left + 1, t * numIntervals - left];
}

// ── stream dequantisation ───────────────────────────────────────────────────
// Every stream decodes to one Float32Array of K*rows*C, knot-major. `meta[i]` is the
// sidecar for knot-local index i (written to disk as {i+1:04d}.json — the readers'
// 1-based convention, see compress_knot_bundle.py "Stream indexing").

export function dequant16(rgbU, rgbL, meta, rows, nch) {
  const K = meta.length, out = new Float32Array(K * rows * nch);
  for (let k = 0; k < K; k++) {
    const mins = meta[k].mins, maxs = meta[k].maxs;
    const base = k * rows * 3, ob = k * rows * nch;
    for (let p = 0; p < rows; p++) {
      for (let c = 0; c < nch; c++) {
        const u = rgbU[base + p * 3 + c];
        const q = (u << 8) | (rgbL ? rgbL[base + p * 3 + c] : 0);
        const mn = mins[c] !== undefined ? mins[c] : mins[0];
        const mx = maxs[c] !== undefined ? maxs[c] : maxs[0];
        out[ob + p * nch + c] = (q / 65535) * (mx - mn) + mn;
      }
    }
  }
  return out;
}

// 4 single-channel (gray) videos -> one (K, rows, 4) array. ffmpeg hands gray back as
// rgb24 with R=G=B, so only every third byte carries data — the same thing
// `_decompress_png8` does when it slices a gray H.265 frame down to one channel.
export function dequant8x4(planes, metas, rows) {
  const K = metas[0].length, out = new Float32Array(K * rows * 4);
  for (let ch = 0; ch < 4; ch++) {
    const rgb = planes[ch], meta = metas[ch];
    for (let k = 0; k < K; k++) {
      const mn = meta[k].mins[0], mx = meta[k].maxs[0], span = mx - mn;
      const base = k * rows * 3, ob = k * rows * 4 + ch;
      for (let p = 0; p < rows; p++) out[ob + p * 4] = (rgb[base + p * 3] / 255) * span + mn;
    }
  }
  return out;
}

// ── public: dequantise already-decoded frames ───────────────────────────────
/**
 * Turn raw rgb24 frames into the per-knot float arrays.
 *
 * `dropLowByte` discards the lower 8-bit plane of every 16-bit stream, exactly as the
 * `png16_upper_seq` / `png16_upper_video` formats do on disk — the value becomes
 * `(u << 8)` instead of `(u << 8) | l`. That is a TRUNCATION toward the stream's min,
 * not a round, and it is deliberate: it is what `compression/offset_stream.py` does, so
 * the page shows exactly what a bundle compressed with `--no_full_precision` would look
 * like rather than a flattering approximation of it.
 *
 * Split out from `decodeKnotChunk` so the viewer can re-run it on cached frames — the
 * 16-bit/8-bit A/B costs no fetch and no ffmpeg pass.
 */
export function dequantStreams(chunk, raw, dropLowByte) {
  const streams = {};
  let rows = 0, numKnots = 0;
  for (const [name, s] of Object.entries(chunk.streams)) {
    const bufs = raw[name];
    if (s.format === 'h265_4ch' || s.format === 'h265_4ch_seq') {
      const metas = ['w', 'x', 'y', 'z'].map(c => s.meta[c]);
      const r = metas[0][0].shape[0];
      streams[name] = dequant8x4(bufs, metas, r);          // already 8-bit; nothing to drop
      rows = rows || r; numKnots = numKnots || metas[0].length;
    } else {
      const nch = s.meta[0].shape[1] || 3;
      const r = s.meta[0].shape[0];
      const storedUpperOnly = s.format === 'png16_upper_video' || s.format === 'png16_upper_seq';
      const low = (storedUpperOnly || dropLowByte || bufs.length < 2) ? null : bufs[1];
      streams[name] = dequant16(bufs[0], low, s.meta, r, nch);
      rows = rows || r; numKnots = numKnots || s.meta.length;
    }
  }
  return { streams, rows, numKnots, sidelen: Math.round(Math.sqrt(rows)) };
}

// ── public: decode every stream of one chunk ────────────────────────────────
/**
 * @param ff        loaded FFmpeg instance
 * @param chunk     scene.json chunk entry (streams + inlined per-knot meta)
 * @param fetchBin  (relPath) => Promise<Uint8Array>
 * @param onStep    (label, done, total) progress callback
 * @param opts      { skipLowByte } — do not even FETCH the lower planes. Halves the
 *                  download for a 16-bit bundle, at the cost of being unable to switch
 *                  back to 16-bit without a reload. (`dequantStreams(…, true)` is the
 *                  live toggle; this is the bandwidth one.)
 * @returns { streams, raw, rows, numKnots, sidelen, bytes, lowBytes, haveLowByte }
 */
export async function decodeKnotChunk(ff, chunk, fetchBin, onStep, opts = {}) {
  const skipLow = !!opts.skipLowByte;
  const names = Object.keys(chunk.streams);
  const raw = {};
  let done = 0, bytes = 0, lowBytes = 0, haveLowByte = false;
  const wanted = (s) => (skipLow && s.format === 'png16_video') ? s.paths.slice(0, 1) : s.paths;
  const total = names.reduce((n, s) => n + wanted(chunk.streams[s]).length, 0);

  for (const name of names) {
    const s = chunk.streams[name];
    const paths = wanted(s);
    raw[name] = [];
    for (let i = 0; i < paths.length; i++) {
      const src = await fetchBin(paths[i]);
      bytes += src.length;
      // path[1] of a png16_video stream IS the lower plane — see build_stream_descriptors
      if (s.format === 'png16_video' && i === 1) { lowBytes += src.length; haveLowByte = true; }
      raw[name].push(await decodeVideo(ff, src));
      onStep && onStep(name, ++done, total);
    }
  }
  return { ...dequantStreams(chunk, raw, false), raw, bytes, lowBytes, haveLowByte };
}

// ── public: evaluate the curve at a timestep ────────────────────────────────
/**
 * Blend the bracketing knots into `outXyz` (n*3) and `outRot` (n*4, NOT normalised —
 * the caller normalises after adding the reference, which is what the field does).
 *
 * `chunkKnots` are the decoded arrays; `startKnot` maps a global knot index to its
 * position inside this chunk.
 */
export function blendKnots(dec, curve, startKnot, left, right, tRel, n, outXyz, outRot) {
  const w = curveBasis(curve, tRel);
  const order = curveOrder(curve, left - startKnot, right - startKnot);

  if (outXyz) {
    outXyz.fill(0, 0, n * 3);
    for (let i = 0; i < order.length; i++) {
      const arr = dec.streams['xyz_' + order[i][0]];
      if (!arr) continue;
      const off = order[i][1] * dec.rows * 3, wi = w[i];
      for (let j = 0; j < n * 3; j++) outXyz[j] += wi * arr[off + j];
    }
  }
  if (outRot) {
    outRot.fill(0, 0, n * 4);
    for (let i = 0; i < order.length; i++) {
      const arr = dec.streams['rot_' + order[i][0]];
      if (!arr) continue;
      const off = order[i][1] * dec.rows * 4, wi = w[i];
      for (let j = 0; j < n * 4; j++) outRot[j] += wi * arr[off + j];
    }
  }
}
