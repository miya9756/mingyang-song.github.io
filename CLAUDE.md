# CLAUDE.md

Guidance for AI agents working in this repo. Read this before editing.

## What this is

Mingyang Song's personal site (GitHub Pages, user site). Fully static: **no backend,
no build step, no bundler, no npm**. The only "build" is regenerating
`projects/smv/scenes.json` from the committed scenes.

The landing page is `index.html` at the root. The substantial piece is
`projects/smv/` — a 100 % client-side player for compressed dynamic 3D-Gaussian
("4D-GS") scenes, the results site for *SmoothMotionVectors* (SIGGRAPH 2026).

The viewer pipeline, all in the browser:
1. keyframe `reference.npz` → unzipped + dequantised with **fflate** (`decode.js`)
2. per-GOP HEVC motion streams (`xyz_u.mkv`, `rot_v.mkv`) → **ffmpeg.wasm** (`decode_motion.js`)
3. per-frame offsets applied off-thread (`dequant_worker.js`)
4. splats rasterised in **WebGL2** (EWA splatting, after antimatter15's `splat`) — all inside `index.html`

## Provenance of `projects/smv/` (IMPORTANT)

It was assembled on 2026-07-25 from **two sources that had diverged in both
directions**. Neither was a superset — do not "resync" from either one wholesale.

| Source | Role |
| --- | --- |
| `/cluster/home/misong/SMV_webviewer` | former Pages mirror; source of the **page, renderer, UI, and all 19 scenes** |
| `/cluster/home/misong/4d-relight/web/player_browser` | training repo; source of truth for the **decode path** |
| `/cluster/home/misong/smoothmotionvector-assets/web/player_browser` | a third, later copy; source of the **split scene picker** (see below) |

What was taken from where:

- **Base = `SMV_webviewer/index.html`.** It carries PCA nav-alignment, the native-res
  A/B parity toggle, the dataset citations, and the only scene set that matches
  `scenes/` (player_browser knew about 2 stale dnerf scenes plus unpublishable
  `neur3d`).
- **`decode.js` / `dequant_worker.js`** — taken from player_browser; they were
  byte-identical to the mirror's `decode_bundle.js` / `dequant_worker_bundle.js`
  apart from the header comment. Modules were renamed to the player_browser names
  and the two `import` lines in `index.html` updated.
- **`decode_motion.js`** — taken from player_browser, which is genuinely newer: it
  adds the 2-way ffmpeg decode pool (`POOL`, `HELPER_RESET`, `_helpers`) so a GOP's
  xyz and rot streams decode concurrently instead of serially. Same exported API
  (`ffmpegReady`, `recreateFFmpeg`, `decodeMotionGopBundle`), so it is a drop-in.
- **`sw.js`** — ported from player_browser, plus its registration in the `<head>`
  script block. Caches `vendor/` (the ~31 MB wasm core) across sessions.
- **Visitor globe** — ported from player_browser: `places` / `setPlaces` / `setYou`
  and the `VISITOR_API` fetch replace the hardcoded `CITIES` ambient arcs, the
  `ipapi.co` call, and the abacus.jasoncameron.dev hit counter. `VISITOR_API` is
  **empty** until the Worker in `tools/visitor_worker/` is deployed; empty falls back
  to ipapi.co for your own arc only.

- **Scene picker** — ported from `smoothmotionvector-assets`: a `methodSel` (dataset)
  dropdown feeding a per-dataset `sceneSel`, replacing one flat list of 19
  `dnerf/hellwarrior  (1.84 MB)`-style labels. `splitSceneName()` parses
  `'<dataset>/<scene>  (<mb> MB)'` out of the scenes.json `name`, so nothing about the
  generated manifest had to change. **`loadBtn` now resolves the scene via
  `_selected()` (match on `sceneSel.value`), not `sceneList[sceneSel.selectedIndex]`** —
  `sceneSel` is a per-dataset subset, so the index no longer indexes `sceneList`. Any
  new code reading the selection must do the same. Switching dataset keeps the current
  scene when a scene of that name exists in the target dataset (none do today — the
  three datasets share no scene names — so it falls back to the first entry).

**Deliberately NOT ported from player_browser** (do not "fix" these without a reason):

- **Depth sort.** player_browser buckets over a sampled 0.5–99.5 percentile range and
  re-sorts the two clamped end buckets. The mirror *replaced* that with exact
  full-range 16-bit bucketing — its comment calls the percentile version "the old
  code" and says the arbitrary intra-bucket order popped as the camera moved. The
  full-range version is kept.
- **Motion-vector tint.** Two parallel implementations of the same feature:
  `offsetColorOn`/`offsetColorMix` (kept) vs `colorDynOn`/`colorDynWeight`.
- **Windowed streaming buffer + preroll gating.** player_browser keeps a sliding
  resident window of GOPs (`GOP_AHEAD=4`, `GOP_BEHIND=2`) with eviction and
  re-decode from cached bytes, gated at play-start by `prerollReady()`. This viewer
  decodes GOPs sequentially and never evicts, holding playback at `decodedEnd()`.
  Porting the window is a real memory win for the larger nerfds/hypernerf scenes but
  it is an architectural change to the streaming layer, not a patch. Preroll gating
  alone is meaningless without it.

The **VERT/FRAG splat shaders are identical** between the two sources (comments
aside), so "the renderer" as such was never stale.

The decode path **mirrors `compression/decoder.py` exactly** (verified to float
epsilon). Do not "optimize" the dequant math, the png16-upper xyz add, or the
logmap→expmap→quat-mul in `dequant_worker.js` without preserving exact parity — a
mismatch silently corrupts the rendered geometry. For decode-path changes, prefer
editing `4d-relight/web/player_browser/` and syncing here.

## View options: the panel is the source of truth

Scene state (`gops`, textures, `builtFrame`, `trajKey`) is torn down and rebuilt on every
load, but the view options (`blendOn`, `shBands`, `trajOn`, `offsetColorOn`, `ellipOn`, …)
live in vars that outlive it. `syncViewOptions()` re-reads every control
after a load and is the only place that reconciles the two.

**Deliberately re-read, not reset.** Resetting to defaults on load would destroy the A/B
workflow this viewer exists for — you pick a setting, then flip between scenes to compare
under it. So the control keeps its value and the renderer is brought to match.

Two rules for anyone adding a control:

1. Add it to `syncViewOptions()`. Otherwise it silently keeps the previous scene's value,
   or its cache survives the scene swap. The bug that motivated this: `trajKey` is
   `activeGop|gFrame|trajCount|trajTrail`, so loading two scenes back-to-back at frame 0
   produces an identical key, `buildTraj()` never re-runs, and `drawTraj()` keeps drawing
   the **previous scene's** trail buffer. `trajVerts` must be zeroed too.
2. If the option needs something a scene may not have, gate it with `_gate(id, ok, why)`
   and fold the capability into the effective var (`blendOn = checked && canBlend`). A
   gated control is dimmed, disabled, and tagged `n/a`, with the reason in its tooltip —
   its checked state is left alone, so the preference returns on a scene that supports it.

Capabilities currently gated: blend (needs ≥2 GOPs *and* `overlap_frames > 0`), specular
(needs an SH codebook), trajectories / colorized offsets (need dynamic gaussians).

**`nativeRes` has no control any more.** Its "Native camera res" checkbox was removed from the
Stream Monitor, so nothing sets the var and the `if(nativeRes&&camMeta)` branch in `frame()` —
plus `fboN` / `ensureFBON()` — is unreachable. The render path is kept deliberately: it is the
only way to compare splat footprint against the GPU reference at the training resolution. Flip
it from the console, or re-add a control and wire it through `syncViewOptions()` (its old gate
was `!!camMeta`).

**Note:** all 19 shipped scenes have `overlap_frames = 0` (and 14 are single-GOP), so the
blend checkbox is inert on every one of them and now always shows `n/a`. The image-space
GOP cross-fade path in `frame()` is effectively dead code against the current scene set.
If that's not intended, it's the packaging side (`build_web_bundle.py`) that needs to emit
overlap, not the viewer.

## Git LFS (read before touching scenes)

Scene binaries are in **Git LFS** (`.gitattributes`): `*.mkv` and `*.npz`. The
ffmpeg `*.wasm` is a plain binary git object, not LFS.

- Clones and CI must run with LFS smudge enabled or scenes are pointer stubs
  (`.github/workflows/pages.yml` already sets `lfs: true`).
- Pages serves the built artifact from its CDN, so visitor traffic costs no LFS
  bandwidth — only CI checkouts do.

## Common tasks

**Run locally** (ES modules + WebGL2 require `http://`, not `file://`):

```bash
python3 -m http.server 8137        # repo root; viewer at /projects/smv/
```

**Add / remove a scene:** drop or delete a folder under
`projects/smv/scenes/<dataset>/<name>/` (must contain `scene.json` + per-GOP
`reference.npz` + `.mkv` streams), then `python3 projects/smv/make_scenes_index.py`.
Never hand-edit `scenes.json`.

**Deploy:** push to `main`.

## Conventions & cautions

- The viewer is intentionally **one big `index.html`** with dense, single-line helpers
  (quaternion/vector math, half-float packing, GLSL as template strings). Match that
  terse style; don't reformat wholesale.
- `projects/smv/vendor/` is vendored third-party code (ffmpeg.wasm, fflate) — read-only.
- This is a **public site**: ship only publishable content. The D-NeRF scenes are
  synthetic; `neur3d` has human faces and must never be committed.
- Citation/paper metadata lives inline in `projects/smv/index.html` (search `citeAcm`
  / `citeBib`).
