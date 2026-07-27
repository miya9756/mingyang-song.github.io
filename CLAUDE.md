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

## `projects/spdef/` — the side-by-side

The SpDef page hosts a 1×2 comparison of the same D-NeRF *bouncingballs* sequence trained
with and without the temporal regularizers (`xyz/rot_velocity_div_loss`,
`xyz/rot_acceleration_loss`; the two runs' `deform_config.yaml` differ in nothing else).
Both scenes are the **single-GOP** packing (`bundle_1_packed`): 150 frames, one keyframe,
`overlap_frames = 0`. The 4-GOP packing (`bundle_4_packed`) was tried and rolled back — it
demonstrates worse, since a GOP boundary is a hard cut between two independently-keyframed
point clouds when overlap is 0. The loader stays multi-GOP-capable either way.

- `viewer.html` is **one panel**, not a copy of the SMV viewer: render core only, no picker,
  no monitor, no view-option panel. It takes `?scene=&id=` and is driven entirely from the
  host page over `postMessage`. It has **no static imports** — hosted, it never fetches the
  decode path at all; the standalone `viewer.html?scene=…` fallback (kept so one panel stays
  debuggable alone) pulls it in with a dynamic `import()`.
- **One `<iframe>` per scene, deliberately.** The renderer keeps its scene in module-level
  vars (`N`, `baseCenter`, `gops`, texture handles); two panels in one document would mean
  two of every global or a refactor into a class. A document per panel also gives each its
  own WebGL context, ffmpeg.wasm and worker.
- **Cameras are always linked**, with no toggle — two panels at different poses would not be a
  comparison. Dropping the toggle also removed the `reemitCam` message that only existed to
  re-sync after re-ticking it.
- **The host does all loading and decoding; the panels are pure renderers.** Motion decode is
  one-shot preprocessing — once offsets are dequantised into the motion array nothing
  downstream touches wasm — so no decoder lives per canvas. Decoding *in* the panels meant two
  module graphs each instantiating a primary + `POOL` helper: **four ffmpeg.wasm instances,
  four workers, four compiles of the ~32 MB core, none ever freed.** Now one instance set
  serves both scenes and `disposeFFmpeg()` frees it when the last GOP lands. Do not move
  decoding back into `viewer.html`.
- **Keyframes are pushed before motion**, so both panels are on screen and orbitable before the
  core is even fetched. All of a scene's keyframes are *cloned* (~900 KB per GOP, and the host
  still needs them to decode); motion arrays (~60 MB per scene, one per GOP) are
  **transferred**, so they can only be sent once — `flush()`'s `sent` flags exist for that.
- **The decode loop is interleaved by GOP index, not scene by scene**, and recycles the ffmpeg
  primary every 4 decodes (`recreateFFmpeg`) as the SMV loader does. Both are inert on the
  single-GOP scenes shipped today — they are there so a multi-GOP packing can be dropped back
  in without the timeline pinning at 0 or a long decode chain running on one wasm heap.
- Protocol is `{ch:'spdef', …}`, `id` panel→host, `to` host→panel; add a message type to both
  ends or it is silently dropped. Panels re-post `hello` until answered, because a panel's
  module script can in principle run before the host attaches its listener.
- **View options (hard ellipsoids / trajectories / colorize motion) live on the host and are
  always broadcast to BOTH panels** via one `view` message carrying the whole option set —
  comparing two scenes under different render settings would be meaningless, so there is
  deliberately no per-panel control. `flush()` re-sends it with the keyframe so a panel that
  installs late doesn't sit at the defaults. The panel's handler must invalidate *both*
  `trajKey` (caches the built trail) and `builtFrame` (caches the written splat colours); an
  option change that doesn't also bump the frame otherwise shows the previous state — the same
  cache trap `syncViewOptions()` documents on the SMV side.
- **Trail max is 150** (the whole sequence) versus the SMV viewer's 60. `buildTraj()` rebuilds
  on every displayed frame, so the cost is real at the top of both sliders: count 1500 / trail
  24 is 1.2 MB per rebuild, but count 5000 / trail 150 is 34.9 MB — ~2 GB/s of `bufferData`
  across two panels at 30 fps. Defaults stay at 1500 / 24 for that reason.
- **No PCA nav-alignment here**, unlike the SMV viewer's D-NeRF path. PCA is computed per
  point cloud, so the two panels would end up with different world-up axes and the comparison
  would no longer be the same view of the same thing. The held-out test camera is used
  verbatim, and `build_web_bundle.py` embeds an identical one in both scenes.
- **`worldUp` is therefore derived from the test camera** (`-vrot(camquat,[0,1,0])` in
  `frameScene()`), not left at the renderer's hardcoded `[0,-1,0]`. D-NeRF's world frame is
  Z-up: that default is ~81° off the camera's up and 0.96 aligned with its *forward*, so Q/E
  dollied in and out instead of rising and drag-yaw tumbled about a near-forward axis. Dropping
  PCA without replacing the axis is what caused it. Any future scene here needs a real camera
  in its `scene.json` for the same reason.

### Shared decode path — do NOT hoist `vendor/` out of `projects/smv/`

`viewer.html` imports `../smv/decode.js` and `../smv/decode_motion.js`. ES module specifiers
resolve against the *importing module*, so those modules still reach their own `./vendor/` —
one copy of the ~31 MB ffmpeg core on disk and in cache, serving both pages. Sharing needs no
move; a "shared lib" folder would only rename the same thing.

The one thing that genuinely does not cross the boundary is **the service worker**: `sw.js`
registered from `/projects/smv/` has scope `/projects/smv/` and cannot control the SpDef page,
and GitHub Pages can't send `Service-Worker-Allowed` to widen it. To give SpDef the same
durable vendor cache, move `sw.js` to `projects/sw.js` (default scope `/projects/`) and
register `'../sw.js'` from both pages — its fetch handler already keys on `/vendor/` appearing
anywhere in the path, so it needs no change. Not done yet; SpDef currently relies on the
plain HTTP cache.

**`coreURLs()` in `decode_motion.js` resolves `./vendor/core/*` against `import.meta.url`, not
the document.** `toBlobURL` fetches, and `fetch` resolves relative strings against the *page* —
the old document-relative form worked only for a page in that folder and 404'd from SpDef.
Keep it module-relative when syncing from `4d-relight/web/player_browser/` (which still has
the document-relative version).

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

**Repackage a SpDef scene** from a training bundle (SpDef has no `scenes.json` — the two
scenes are named directly in `projects/spdef/index.html`):

```bash
conda run -n 4dre python ~/4d-relight/web/player_browser/build_web_bundle.py \
  --bundle /cluster/scratch/misong/4dre/dnerf/bouncingballs/bundle_1_packed \
  --name spdef1_reg --no-index \
  --scene_config /cluster/scratch/misong/4dre/dnerf/bouncingballs/scene_config.yaml \
  --source_path /cluster/scratch/misong/datasets/dnerf/bouncingballs
# then move web/player_browser/scenes/<name>/ -> projects/spdef/scenes/bouncingballs_reg/
# and set scene.json's "name" to the destination folder (the --name is only a build handle)
```

`--scene_config` is what embeds the held-out test camera; without it the viewer opens on a
default square camera and the scene looks lost. Both SpDef scenes must carry the *same*
camera or the side-by-side stops being a comparison.

**Deploy:** push to `main`.

## Conventions & cautions

- **Every page declares `color-scheme`, a `<meta name="theme-color">` tracking its `--bg`, and
  a `background` on its `html` rule** — without them the page is tinted but the browser chrome
  around it is not, and Chrome and Safari disagree about the gap. Enforced by `verify.py`;
  rationale in the *Page chrome* section of `.claude/skills/site-design/SKILL.md`. Applies to
  any new project page too.
- The viewer is intentionally **one big `index.html`** with dense, single-line helpers
  (quaternion/vector math, half-float packing, GLSL as template strings). Match that
  terse style; don't reformat wholesale.
- `projects/smv/vendor/` is vendored third-party code (ffmpeg.wasm, fflate) — read-only.
- This is a **public site**: ship only publishable content. The D-NeRF scenes are
  synthetic; `neur3d` has human faces and must never be committed.
- Citation/paper metadata lives inline in `projects/smv/index.html` (search `citeAcm`
  / `citeBib`).
