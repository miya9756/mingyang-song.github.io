// Port of oilpaint/anim.py -- what moves, and how, from one frame to the next.
//
// The Python carries the design: the two cost regimes (moving a swirl re-rasterises at
// ~2.3 s a frame; moving the light re-runs `finish` alone at 0.056 s, 42x cheaper), the
// spec's JSON shape, and why each easing exists. Read that first.
//
// Only the ARITHMETIC is ported. `validate` is not: it is a guard for the CLI, where a
// typo costs a two-minute render, and the page can do better than a port of it because it
// already holds `schema.json` and can refuse a bad sweep in the control that offers it.
//
// The one thing to be careful of here is the same thing the Python's `validate` refuses
// outright: JS has a single number type, so nothing in this file can tell an int
// PaintConfig field from a float one by looking at a value. Sweeps are float-only, which
// removes the question rather than answering it twice.

import { PRESETS as FLOW_PRESETS } from './flow.js';

export const EASINGS = ['linear', 'smooth', 'pingpong', 'smooth-pingpong'];
const LOOPING = new Set(['pingpong', 'smooth-pingpong']);

// Must equal `pipeline.RELIGHT_PARAMS` on the Python side, which is where the reasoning
// lives -- next to the `finish` that makes it true. The parity suite compares the two sets
// directly, because a stale entry here is an animation whose frames are silently identical.
export const RELIGHT_PARAMS = new Set([
  'impasto_depth', 'light_deg', 'light_elev_deg', 'gloss',
  'canvas_weave', 'occlusion', 'view_deg', 'view_elev_deg',
]);

export const DEFAULT_EASE = 'smooth';
export const DEFAULT_FRAMES = 48;
export const MIN_FRAMES = 2, MAX_FRAMES = 600;

/** Linear time in [0,1] -> eased time in [0,1]. Multiplies, not `**`; see the Python. */
export function ease(name, t) {
  t = Math.min(1.0, Math.max(0.0, t));
  if (LOOPING.has(name)) {
    // A triangle: out and back, so the animation ends where it started and the video loops.
    t = t < 0.5 ? 2.0 * t : 2.0 - 2.0 * t;
    return name === 'smooth-pingpong' ? t * t * (3.0 - 2.0 * t) : t;
  }
  if (name === 'smooth') return t * t * (3.0 - 2.0 * t);
  if (name === 'linear') return t;
  throw new Error(`unknown easing ${name}`);
}

/**
 * Linear time for frame `i`, before easing. The two denominators are not a detail: a
 * LOOPING animation must not repeat its first frame at the end (`i / frames`), and a
 * one-way one must actually arrive at it (`i / (frames - 1)`).
 */
export function frameTime(i, frames, easeName = DEFAULT_EASE) {
  frames = Math.max(1, Math.trunc(frames));
  if (LOOPING.has(easeName)) return i / frames;
  return i / Math.max(1, frames - 1);
}

/** a*(1-e) + b*e, NOT a + (b-a)*e -- the second can miss `b` by an ulp at e = 1. */
function lerp(a, b, e) { return a * (1.0 - e) + b * e; }

/**
 * The swirl centres at time `t`, or null when the animation moves none.
 *
 * null rather than [], because empty means something specific downstream: `flow.paramsFor`
 * reads it as "nothing placed", i.e. the preset's own spiral.
 */
export function vorticesAt(spec, t) {
  const tracks = spec.vortices || [];
  if (!tracks.length) return null;
  const e = ease(spec.ease || DEFAULT_EASE, t);
  return tracks.map(v => [lerp(v.start[0], v.end[0], e), lerp(v.start[1], v.end[1], e)]);
}

/** The animated parameter overrides at time `t`, as a plain object. */
export function paramsAt(spec, t) {
  const tracks = spec.params || {};
  const names = Object.keys(tracks);
  if (!names.length) return {};
  const e = ease(spec.ease || DEFAULT_EASE, t);
  const out = {};
  for (const k of names) out[k] = lerp(Number(tracks[k].start), Number(tracks[k].end), e);
  return out;
}

/** `cfg` with this frame's sweep applied. A NEW object -- the caller reuses its config. */
export function configAt(cfg, spec, t) {
  const over = paramsAt(spec, t);
  if (!Object.keys(over).length) return cfg;
  return Object.assign({}, cfg, over);
}

/**
 * Why this animation would not move under `cfg`, or null if it should. A STRING, for putting
 * in front of somebody.
 *
 * The Python carries the failure this exists because of: a swirl path animated against a
 * config whose `flow` was 'none', 36 byte-identical frames, and a video with a play button
 * on it and nothing behind it. Both front ends call this before committing to the render;
 * both ALSO check afterwards that the frames they made actually differ, which catches the
 * causes this cannot know about.
 */
export function inertReason(spec, cfg) {
  const tracks = spec.params || {};
  const names = Object.keys(tracks);
  const vortices = spec.vortices || [];
  if (!names.length && !vortices.length) {
    return 'nothing is animated: give a vortex path or a parameter sweep';
  }
  if (vortices.length) {
    const kind = (FLOW_PRESETS[cfg.flow] || {}).kind || 'none';
    if (kind !== 'swirl') {
      const swirls = Object.keys(FLOW_PRESETS)
        .filter(n => FLOW_PRESETS[n].kind === 'swirl').sort();
      return `flow is '${cfg.flow}', which has no swirls in it, so the paths are read by `
           + `nothing (try ${swirls.join(' or ')})`;
    }
    if (cfg.flow_strength <= 0.0) {
      return 'flow_strength is 0, so the flow field is skipped entirely';
    }
    return null;
  }
  const flat = names.filter(k => Number(tracks[k].start) === Number(tracks[k].end)).sort();
  if (flat.length === names.length) {
    return `${flat.join(', ')} start and end at the same value`;
  }
  const live = names.filter(k => !flat.includes(k));
  if (live.every(k => k.startsWith('flow_'))
      && (cfg.flow === 'none' || cfg.flow_strength <= 0.0)) {
    return `flow is '${cfg.flow}', so sweeping ${live.slice().sort().join(', ')} changes nothing`;
  }
  return null;
}

/**
 * True when nothing in this animation can move a stroke, so ONE rasterisation serves every
 * frame and only the lighting re-runs. 42x cheaper, measured. The page's `relight` path.
 */
export function isRelightOnly(spec) {
  if (spec.vortices && spec.vortices.length) return false;
  const names = Object.keys(spec.params || {});
  return names.length > 0 && names.every(k => RELIGHT_PARAMS.has(k));
}
