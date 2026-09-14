// decode_motion.js
// ----------------
// In-browser motion decode for the 4d-relight bundle format. ffmpeg.wasm decodes
// the two per-GOP HEVC streams (xyz_u.mkv = png16_upper, rot_v.mkv = logmap) to
// raw RGB; a Web Worker then dequantises + applies the offsets to the keyframe's
// dynamic block. Output: Float32 [F*D*7] = (x,y,z, qw,qx,qy,qz) per dynamic
// Gaussian per motion frame (absolute values, ready for the renderer).
//
// Mirrors compression/offset_stream.py + compression/decoder.py:
//   xyz (png16_upper):  v = (u8<<8)/65535 * (max-min) + min ;  pos[dyn] += v
//   rot (logmap):       v = u8/255 * (max-min) + min  (3-vec so(3))
//                       delta = expmap(v) ;  rot[dyn] = norm(quat_mul(base, delta))
import { FFmpeg } from './vendor/ffmpeg/index.js';
import { toBlobURL } from './vendor/util/index.js';

let _ff = null, _loading = null, _coreURLs = null;
// Resolve the vendored core against THIS MODULE's url, not the document's. toBlobURL fetches,
// and fetch() resolves a relative string against the importing *page* — so the old './vendor/core'
// worked only for a page sitting in this folder and 404'd for any other consumer (the SpDef page
// imports this module from ../smv/). Matches how dqWorker() already resolves dequant_worker.js.
async function coreURLs() {
  if (_coreURLs) return _coreURLs;
  const V = import.meta.url;
  _coreURLs = {
    coreURL: await toBlobURL(new URL('./vendor/core/ffmpeg-core.js', V).href, 'text/javascript'),
    wasmURL: await toBlobURL(new URL('./vendor/core/ffmpeg-core.wasm', V).href, 'application/wasm'),
  };
  return _coreURLs;
}
export function ffmpegReady(onLog) {
  if (_ff) return Promise.resolve(_ff);
  if (_loading) return _loading;
  _loading = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    await ff.load(await coreURLs());
    _ff = ff; return ff;
  })();
  _loading.catch(() => { _loading = null; });   // never cache a failed load
  return _loading;
}
export async function recreateFFmpeg(onLog) {
  if (_ff) { try { _ff.terminate(); } catch (e) {} }
  _ff = null; _loading = null;
  return ffmpegReady(onLog);
}

let _ctr = 0;
async function decodeVideo(ff, bytes) {     // .mkv -> Uint8Array rgb24 (F*H*W*3)
  const inN = `m${_ctr}.mkv`, outN = `m${_ctr}.rgb`; _ctr++;
  try {
    // writeFile lists data.buffer as transferable → it DETACHES the source ArrayBuffer. The caller's
    // stream bytes (gops[g].src) are cached for on-demand re-decode after an eviction, so we must hand
    // ffmpeg a fresh copy; otherwise the 2nd decode of a GOP (loop / seek-back) reads an emptied
    // buffer and the decoder hangs.
    await ff.writeFile(inN, bytes.slice());
    await ff.exec(['-i', inN, '-f', 'rawvideo', '-pix_fmt', 'rgb24', outN]);
    return await ff.readFile(outN);
  } finally {                                // always clean up MEMFS, even on error
    try { await ff.deleteFile(inN); } catch (e) {}
    try { await ff.deleteFile(outN); } catch (e) {}
  }
}

// ── per-video decode pool (primary + helpers) ────────────────────────────────
// ffmpeg.wasm is single-threaded (one exec per instance at a time), so a GOP's xyz + rot streams
// would decode strictly serially on the one instance. Here we fan them out across the caller's
// `primary` instance plus lazily-spawned HELPER instances (loaded from the same in-memory wasm blobs
// — no extra network fetch). POOL===1, a low-memory device, or a helper that fails to spawn all
// degrade transparently back to the serial-on-primary path.
const _hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
const _lowMem = (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory < 4);
const POOL = _lowMem ? 1 : Math.max(1, Math.min(2, Math.floor(_hc / 2)));   // 2 streams per GOP, so 2 decoders saturate it
const HELPER_RESET = 12;                    // recreate a helper's wasm heap after this many decodes (mirrors the primary's periodic reset)
const _helpers = [];                        // persistent helper instances: { ff, count }
let _helpersInit = null;

async function _makeHelper() { const ff = new FFmpeg(); await ff.load(await coreURLs()); return { ff, count: 0 }; }
function _ensureHelpers() {                 // spawn POOL-1 helpers once, best-effort (non-blocking for the caller)
  if (_helpersInit) return _helpersInit;
  _helpersInit = (async () => {
    for (let i = _helpers.length; i < POOL - 1; i++) {
      try { _helpers.push(await _makeHelper()); }
      catch (e) { console.warn('[smv] ffmpeg helper', i, 'spawn failed — continuing with fewer:', (e && e.message) || e); break; }
    }
    console.info(`[smv] parallel decode: ${1 + _helpers.length}/${POOL} ffmpeg instance(s) (hardwareConcurrency=${_hc})`);
  })();
  return _helpersInit;
}
async function _recreateHelper(slot) { try { slot.ff.terminate(); } catch (e) {} slot.ff = new FFmpeg(); await slot.ff.load(await coreURLs()); slot.count = 0; }

// Decode `srcs` (video byte buffers) concurrently across the pool; returns rgb24 arrays in the SAME
// order. The primary is reset externally (by the player's buffer manager); helpers self-reset by count.
async function poolDecode(primary, srcs) {
  _ensureHelpers();                                              // kick off helper spawn in the background — the first GOP runs on the primary alone (no added time-to-first-frame)
  const slots = [{ ff: primary, primary: true }, ..._helpers];   // whatever helpers are ready right now
  const out = new Array(srcs.length);
  let next = 0;                                                  // shared cursor; `const i = next++` runs sync before any await, so no two workers grab the same index
  await Promise.all(slots.map(async (slot) => {
    for (;;) {
      const i = next++;
      if (i >= srcs.length) break;
      if (!slot.primary && slot.count >= HELPER_RESET) { try { await _recreateHelper(slot); } catch (e) {} }
      try { out[i] = await decodeVideo(slot.ff, srcs[i]); }
      catch (e) {
        if (slot.primary) throw e;                               // let the buffer manager recreate the primary + retry the GOP
        console.warn('[smv] ffmpeg helper decode failed, recreating heap + retrying once:', (e && e.message) || e);
        await _recreateHelper(slot); out[i] = await decodeVideo(slot.ff, srcs[i]);
      }
      if (!slot.primary) slot.count++;
    }
  }));
  return out;
}

// Hand the decoder's memory back. Motion decode is one-shot preprocessing — once a GOP's offsets
// are dequantised into the motion array, nothing downstream touches wasm again — so a consumer
// that decodes a fixed set of scenes up front (the SpDef side-by-side) can free the primary, the
// helper pool, the dequant worker and the blob URLs still holding a copy of the ~32 MB core.
// The SMV viewer deliberately does NOT call this: it re-decodes on scene switch.
//
// TWO THINGS ARE FREED HERE AND THEY HAVE VERY DIFFERENT COSTS TO REACQUIRE.
//
//   the INSTANCES  — the primary, the helper pool and the dequant worker. Each holds a live wasm
//                    heap that GROWS with what it has decoded, so this is the large and unbounded
//                    part. Rebuilt in milliseconds.
//   the CORE URLs  — blob URLs holding the fetched ~32 MB of ffmpeg-core.js/.wasm. Fixed size, and
//                    reacquiring them means FETCHING 32 MB again: from the HTTP cache if it still
//                    has them, from the network if not. (The service worker that would make that
//                    reliable is registered under /projects/smv/ and its scope does not reach the
//                    SpDef page.)
//
// `keepCore` frees only the first. That is what a consumer wants when a scene can be unloaded and
// loaded again in the same session — the SpDef page's Clear button — because the working set is
// genuinely returned while a reload costs a wasm compile rather than a 32 MB download. Default is
// the full release, so a page that is done for good (viewer.html standalone) is unaffected.
export async function disposeFFmpeg({ keepCore = false } = {}) {
  const kill = (f) => { try { f.terminate(); } catch (e) {} };
  if (_ff) kill(_ff);
  _ff = null; _loading = null;
  try { await _helpersInit; } catch (e) {}          // don't leak a helper still mid-spawn
  for (const h of _helpers) kill(h.ff);
  _helpers.length = 0; _helpersInit = null;
  if (_dq) { kill(_dq); _dq = null; _dqJobs = null; }
  if (_coreURLs && !keepCore) {
    for (const u of Object.values(_coreURLs)) { try { URL.revokeObjectURL(u); } catch (e) {} }
    _coreURLs = null;
  }
}

// Whether the ~32 MB core is already fetched, so a caller can say "loading decoder (~31 MB)" only
// when that is actually what is about to happen. Cheap honesty: after a Clear the next load
// reuses the blobs and the old wording promised a download that never occurs.
export function coreCached() { return !!_coreURLs; }

// ── dequant worker ───────────────────────────────────────────────────────────
let _dq = null, _dqJobs = null, _dqId = 0;
function dqWorker() {
  if (_dq) return _dq;
  _dqJobs = new Map();
  _dq = new Worker(new URL('./dequant_worker.js', import.meta.url), { type: 'module' });
  _dq.onmessage = (e) => {
    const job = _dqJobs.get(e.data.id);
    if (job) { _dqJobs.delete(e.data.id); job.resolve(e.data.motion); }
  };
  _dq.onerror = (err) => {
    const e = new Error('dequant worker error: ' + ((err && err.message) || err));
    for (const job of _dqJobs.values()) job.reject(e);
    _dqJobs.clear(); try { _dq.terminate(); } catch (_) {} _dq = null;
  };
  return _dq;
}
function dequantInWorker(payload, transfers) {
  const w = dqWorker(), id = ++_dqId;
  return new Promise((resolve, reject) => {
    _dqJobs.set(id, { resolve, reject });
    w.postMessage({ id, ...payload }, transfers);
  });
}

// Decode one GOP's motion. `streams` = { xyz:{bytes,meta[]}, rot:{bytes,meta[]} }
// where meta[localFrame] = {mins,maxs,shape:[D,3]} (index 0 = keyframe = null).
// Returns { motion: Float32[F*D*7], F, D, decodeMs }.
export async function decodeMotionGopBundle(ff, streams, keyframe) {
  const D = keyframe.numDyn, si = keyframe.staticIdx;
  const baseXyz = keyframe.center.subarray(si * 3);     // D*3
  const baseRot = keyframe.quat.subarray(si * 4);       // D*4

  const _t0 = performance.now();
  // decode the two streams concurrently across the pool (primary `ff` + helper), not serially
  const [xyzRgb, rotRgb] = await poolDecode(ff, [streams.xyz.bytes, streams.rot.bytes]);   // each F*D*3
  const F = xyzRgb.length / (D * 3);

  // Pack the per-frame [min, range] for each axis into flat arrays for the worker.
  const xyzMeta = streams.xyz.meta, rotMeta = streams.rot.meta;
  const xMin = new Float32Array(F * 3), xRng = new Float32Array(F * 3);
  const rMin = new Float32Array(F * 3), rRng = new Float32Array(F * 3);
  for (let i = 0; i < F; i++) {
    const mx = xyzMeta[i + 1], mr = rotMeta[i + 1];
    for (let c = 0; c < 3; c++) {
      xMin[i * 3 + c] = mx.mins[c]; xRng[i * 3 + c] = mx.maxs[c] - mx.mins[c];
      rMin[i * 3 + c] = mr.mins[c]; rRng[i * 3 + c] = mr.maxs[c] - mr.mins[c];
    }
  }

  const bx = baseXyz.slice(), br = baseRot.slice();   // copies: originals stay live for rendering
  const transfers = [xyzRgb.buffer, rotRgb.buffer, bx.buffer, br.buffer,
    xMin.buffer, xRng.buffer, rMin.buffer, rRng.buffer];
  const motion = await dequantInWorker(
    { D, F, baseXyz: bx, baseRot: br, xyzRgb, rotRgb, xMin, xRng, rMin, rRng },
    transfers,
  );
  return { motion, F, D, decodeMs: performance.now() - _t0 };
}
