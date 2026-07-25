// decode.js
// ---------
// In-browser reconstruction of a per-GOP keyframe from the 4d-relight
// `bundle_packed` format (see compression/decoder.py + bundle_manifest.py).
//
// A scene is described by scene.json (produced by web/build_web_bundle.py):
// per-GOP reference.npz keyframes + .mkv offset streams + inlined per-frame meta.
// This module handles the *keyframe* (the static Gaussian state); motion offsets
// are decoded in decode_motion.js.
//
// Mirrors compression/decoder.py exactly:
//   * scalar-quantised attrs: q / (2^nbit - 1) * range + min
//   * base_color is a raw SH-DC coefficient  -> rgb = 0.5 + C0*dc
//   * scaling / opacity are stored ALREADY ACTIVATED (world-space sigma / [0,1] alpha)
//   * spec SH via VQ codebook(s): single `sh_codebook`, or split
//     `static_sh_codebook` (rows [0,static_idx)) + `sh_codebook` (dynamic rows)
//   * shared statics: the first num_shared_statics rows of shared/reference.npz
//     are prepended to each GOP's own rows.
//
// Output keyframe (matches the renderer's expectations in index.html):
//   { center:f32[N*3], scale:f32[N*3], quat:f32[N*4] wxyz, color:u32[N] rgba,
//     shCodebook:f32[K*45]|null, shIndex:u32[N]|null,
//     numTotal, staticIdx, numDyn }
import { unzipSync } from './vendor/fflate.js';

const SH_C0 = 0.28209479177387814;

// ---- .npy / .npz parsing (verbatim from the reference player) --------------
export function parseNpy(u8) {
  const ver = u8[6];
  let hlen, hstart;
  if (ver === 1) { hlen = u8[8] | (u8[9] << 8); hstart = 10; }
  else { hlen = u8[8] | (u8[9] << 8) | (u8[10] << 16) | (u8[11] << 24); hstart = 12; }
  const hdr = new TextDecoder().decode(u8.subarray(hstart, hstart + hlen));
  const descr = /'descr':\s*'([^']+)'/.exec(hdr)[1];
  const shapeStr = /'shape':\s*\(([^)]*)\)/.exec(hdr)[1];
  const shape = shapeStr.split(',').map(s => s.trim()).filter(s => s.length).map(Number);
  const off = hstart + hlen;
  const buf = u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + u8.byteLength);
  let data;
  if (descr === '<f2' || descr === '|f2') data = new Uint16Array(buf);   // float16 (raw)
  else if (descr === '<f4') data = new Float32Array(buf);
  else if (descr === '<f8') data = new Float64Array(buf);
  else if (descr === '|u1' || descr === '<u1') data = new Uint8Array(buf);
  else if (descr === '<u2') data = new Uint16Array(buf);
  else if (descr === '<i8') data = new BigInt64Array(buf);
  else if (descr === '<i4') data = new Int32Array(buf);
  else if (descr === '|b1') data = new Uint8Array(buf);
  else throw new Error('npy dtype not handled: ' + descr);
  return { descr, shape, data };
}
export function parseNpz(u8) {
  const files = unzipSync(u8);
  const out = {};
  for (const name in files) out[name.replace(/\.npy$/, '')] = parseNpy(files[name]);
  return out;
}
const scalar = (e) => (e.data.length ? (typeof e.data[0] === 'bigint' ? Number(e.data[0]) : e.data[0]) : 0);
export function f16to32(u16, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = u16[i], s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
    out[i] = e === 0 ? (s ? -1 : 1) * 2 ** -14 * (f / 1024)
      : e === 0x1f ? (f ? NaN : (s ? -1 : 1) * Infinity)
      : (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

// dequantize attr {key, key_min, key_range, key_n_bit} -> Float32Array, nc-wide
function dequantAttr(npz, key, nc) {
  const q = npz[key].data, mn = npz[key + '_min'].data, rg = npz[key + '_range'].data;
  const nbit = Number(scalar(npz[key + '_n_bit']));
  const max = 2 ** nbit - 1;
  const n = q.length / nc;
  const out = new Float32Array(q.length);
  // min/range may be scalar (broadcast) or per-component (length nc)
  const mB = mn.length >= nc, rB = rg.length >= nc;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const k = i * nc + c;
      out[k] = (q[k] / max) * (rB ? rg[c] : rg[0]) + (mB ? mn[c] : mn[0]);
    }
  return out;
}

// Bake the trainer's SH-rest convention into the codebook.
//
// The training/eval renderer (gaussian_splatting/render_gs.py, used by
// eval_bundle.py) feeds the rasteriser ``dc`` separately and
// ``shs = cat([dc, features_rest])[:, 3:]`` — i.e. only ``features_rest[2:15]``
// (13 coeffs), mapped onto SH rest-basis functions 0..12. So rest[0],rest[1]
// are never used (they're exactly 0 in the data) and the meaningful coeffs are
// shifted by 2 relative to the standard layout. Our shader evaluates the
// standard basis (rest[k] -> basis[k]), so we pre-shift each codebook entry:
// basis[j] reads old coeff j+2 (j=0..12); the top two l=3 bands get 0.
function shiftRestCodebook(cb) {
  const K = cb.length / 45 | 0, out = new Float32Array(cb.length);  // zero-filled
  for (let k = 0; k < K; k++) {
    const o = k * 45;
    for (let j = 0; j < 13; j++) {
      const dst = o + j * 3, src = o + (j + 2) * 3;
      out[dst] = cb[src]; out[dst + 1] = cb[src + 1]; out[dst + 2] = cb[src + 2];
    }
    // basis 13,14 (l=3 m=2,3) left 0 — render_gs's shs[:,3:] never supplies them
  }
  return out;
}

// SH codebook: new encoder stores verbatim float32 (no _min); legacy is quantised.
function decodeCodebook(npz, key) {
  const e = npz[key];
  let cb;
  if (!(key + '_min' in npz)) cb = Float32Array.from(e.data);   // verbatim f32
  else {
    const q = e.data, mn = npz[key + '_min'].data, rg = npz[key + '_range'].data;
    const nbit = (key + '_n_bit') in npz ? Number(scalar(npz[key + '_n_bit'])) : 8;
    const max = 2 ** nbit - 1, M = e.shape[1], K = e.shape[0]; cb = new Float32Array(K * M);
    for (let k = 0; k < K; k++) { const o = k * M; for (let c = 0; c < M; c++) cb[o + c] = q[o + c] / max * rg[c] + mn[c]; }
  }
  return shiftRestCodebook(cb);
}

function concatF32(a, b) { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }

// Decode the geometry + colour of one reference NPZ (no shared prepend).
function decodeReference(npz) {
  const n = npz['position'].shape[0];
  const center = npz['position'].descr.includes('f2')
    ? f16to32(npz['position'].data, n * 3) : Float32Array.from(npz['position'].data);

  // rotation: quantised quat, then normalise (wxyz)
  const rot = dequantAttr(npz, 'rotation', 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4, l = Math.hypot(rot[o], rot[o + 1], rot[o + 2], rot[o + 3]) || 1;
    rot[o] /= l; rot[o + 1] /= l; rot[o + 2] /= l; rot[o + 3] /= l;
  }
  const scale = dequantAttr(npz, 'scaling', 3);     // already activated (world sigma)
  const opacity = dequantAttr(npz, 'opacity', 1);   // already sigmoid'd, [0,1]
  const dc = dequantAttr(npz, 'base_color', 3);     // raw SH DC -> rgb = 0.5 + C0*dc
  const staticIdx = 'static_idx' in npz ? Number(scalar(npz['static_idx'])) : n;
  return { n, center, rot, scale, opacity, dc, staticIdx };
}

// Build this NPZ's own combined SH codebook + per-row index into it.
// Returns null when the scene carries no specular layer.
function decodeSH(npz, n, staticIdx) {
  if ('static_sh_codebook' in npz) {
    const scb = decodeCodebook(npz, 'static_sh_codebook');        // Ks*45 (rows [0,static_idx))
    const Ks = scb.length / 45;
    const sidx = npz['static_spec_color_indices'].data;           // len staticIdx
    const idx = new Uint32Array(n);
    for (let i = 0; i < staticIdx; i++) idx[i] = sidx[i];
    const nDyn = n - staticIdx;
    if (nDyn <= 0) return { cb: scb, idx };                       // all-static (e.g. shared ref): drop unused dyn codebook
    const dcb = decodeCodebook(npz, 'sh_codebook');               // Kd*45 (dynamic rows)
    const didx = npz['spec_color_indices'].data;
    for (let d = 0; d < nDyn; d++) idx[staticIdx + d] = Ks + didx[d];
    return { cb: concatF32(scb, dcb), idx };
  }
  if ('sh_codebook' in npz) {
    const cb = decodeCodebook(npz, 'sh_codebook');
    const di = npz['spec_color_indices'].data;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = di[i];
    return { cb, idx };
  }
  return null;
}

function toRgba(dc, opacity, n) {
  const color = new Uint32Array(n), cb = new Uint8Array(color.buffer);
  const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  for (let i = 0; i < n; i++) {
    cb[i * 4]     = cl((0.5 + SH_C0 * dc[i * 3])     * 255);
    cb[i * 4 + 1] = cl((0.5 + SH_C0 * dc[i * 3 + 1]) * 255);
    cb[i * 4 + 2] = cl((0.5 + SH_C0 * dc[i * 3 + 2]) * 255);
    cb[i * 4 + 3] = cl(opacity[i] * 255);
  }
  return color;
}

// Cull extreme floaters (clamp to centre, alpha 0) so they don't wreck the CPU
// depth-sort range. One O(N) pass. (Verbatim behaviour from the reference player.)
function sanitizeKeyframe(kf) {
  const c = kf.center, n = kf.numTotal, cb = new Uint8Array(kf.color.buffer);
  const step = Math.max(1, Math.floor(n / 4096));
  let sx = 0, sy = 0, sz = 0, m = 0;
  for (let i = 0; i < n; i += step) {
    const x = c[3 * i], y = c[3 * i + 1], z = c[3 * i + 2];
    if (isFinite(x) && isFinite(y) && isFinite(z)) { sx += x; sy += y; sz += z; m++; }
  }
  if (!m) return;
  const cx = sx / m, cy = sy / m, cz = sz / m, ds = [];
  for (let i = 0; i < n; i += step) {
    const d = Math.hypot(c[3 * i] - cx, c[3 * i + 1] - cy, c[3 * i + 2] - cz);
    if (isFinite(d)) ds.push(d);
  }
  ds.sort((a, b) => a - b);
  const thr = (ds[Math.floor(ds.length * 0.99)] || 1) * 20;
  for (let i = 0; i < n; i++) {
    const x = c[3 * i], y = c[3 * i + 1], z = c[3 * i + 2];
    if (!(isFinite(x) && isFinite(y) && isFinite(z)) || Math.hypot(x - cx, y - cy, z - cz) > thr) {
      c[3 * i] = cx; c[3 * i + 1] = cy; c[3 * i + 2] = cz; cb[4 * i + 3] = 0;
    }
  }
}

// Decode a shared/reference.npz once (cached by the caller) into a reusable struct.
export function decodeShared(npz) {
  const ref = decodeReference(npz);
  const sh = decodeSH(npz, ref.n, ref.staticIdx);
  return { ref, sh };
}

// Build the full keyframe for one GOP.
//   gopNpz:  parsed gop_g/reference.npz
//   shared:  result of decodeShared(...) or null
//   nShared: num_shared_statics (rows of `shared` to prepend) or 0
export function buildKeyframe(gopNpz, shared, nShared) {
  const g = decodeReference(gopNpz);
  const gsh = decodeSH(gopNpz, g.n, g.staticIdx);

  let center, scale, rot, opacity, dc, numTotal, staticIdx, shCodebook = null, shIndex = null;

  if (shared && nShared > 0) {
    const s = shared.ref;
    const sub = (arr, nc) => arr.subarray(0, nShared * nc);
    center  = concatF32(sub(s.center, 3),  g.center);
    scale   = concatF32(sub(s.scale, 3),   g.scale);
    rot     = concatF32(sub(s.rot, 4),     g.rot);
    opacity = concatF32(sub(s.opacity, 1), g.opacity);
    dc      = concatF32(sub(s.dc, 3),      g.dc);
    numTotal = nShared + g.n;
    staticIdx = nShared + g.staticIdx;     // shared rows all static + GOP's own static prefix
    if (shared.sh && gsh) {
      const Ks = shared.sh.cb.length / 45;
      shCodebook = concatF32(shared.sh.cb, gsh.cb);
      shIndex = new Uint32Array(numTotal);
      shIndex.set(shared.sh.idx.subarray(0, nShared), 0);
      for (let i = 0; i < g.n; i++) shIndex[nShared + i] = Ks + gsh.idx[i];
    }
  } else {
    center = g.center; scale = g.scale; rot = g.rot; opacity = g.opacity; dc = g.dc;
    numTotal = g.n; staticIdx = g.staticIdx;
    if (gsh) { shCodebook = gsh.cb; shIndex = gsh.idx; }
  }

  const kf = {
    center, scale, quat: rot, color: toRgba(dc, opacity, numTotal),
    shCodebook, shIndex,
    numTotal, staticIdx, numDyn: numTotal - staticIdx,
  };
  sanitizeKeyframe(kf);
  return kf;
}
