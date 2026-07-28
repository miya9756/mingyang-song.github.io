# CLAUDE.md

Guidance for AI agents working in this repo. Read this before editing.

## What this is

Mingyang Song's personal site (GitHub Pages, user site). Fully static: **no backend,
no build step, no bundler, no npm**. The only "build" is regenerating
`projects/smv/scenes.json` from the committed scenes.

The landing page is `index.html` at the root, and it links three project pages:
`projects/smv/` (SmoothMotionVectors), `projects/spdef/` (Spline Deformation Field) and
`projects/grain/` (camera-noise playground). The substantial piece is
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

The SpDef page hosts **two independent comparisons**, both driven by the one host script:

1. **1×2, D-NeRF *bouncingballs*** — the same sequence trained with and without the temporal
   regularizers (`xyz/rot_velocity_div_loss`, `xyz/rot_acceleration_loss`; the two runs'
   `deform_config.yaml` differ in nothing else). 150 frames.
2. **1×3, HyperNeRF *americano*** — a casual hand-held capture, showing knot count as a
   regularizer: 33 knots (`spline_knot_ratio 0.2`, `temporal_capacity 13`) vs the full count
   (`0.9` / `59`), plus full-count with `xyz/rot_velocity_div_loss` zeroed. 200 frames. Note
   the *no-reg* run here zeroes only the velocity-divergence terms, not the acceleration ones
   — unlike the bouncingballs pair, which zeroes both.

All five scenes are the **single-GOP** packing: one keyframe, `overlap_frames = 0`. For
bouncingballs the 4-GOP packing (`bundle_4_packed`) was tried and rolled back — it demonstrates
worse, since a GOP boundary is a hard cut between two independently-keyframed point clouds when
overlap is 0. The loader stays multi-GOP-capable either way.

**Nothing loads until its Load button is pressed.** Five panels is ~11 MB of scenes, five WebGL
contexts and a ~32 MB decoder — too much to spend on a visitor who came for the paper link. Until
a group is started its iframes carry the viewer URL in **`data-src`, not `src`**, so no viewer,
GL context or decoder exists for it. `startGroup()` assigns `src` and enqueues; groups run **one
at a time** through `pump()`, because two quick clicks would otherwise put two decode chains on
one wasm heap and race `disposeFFmpeg()` against a live decode. The decoder is released when the
queue drains and re-acquired (warm cache) if another group is loaded later. `verify.py` reads
`data-src` for asset checking; without that it stopped seeing `viewer.html` entirely.

**Each comparison is a `.subcard`** — heading, lede, panels, transport, status line and view
options in one bordered block, so it is unambiguous which transport drives which panels. Three
tones make the nesting read without extra rules: page `--bg`, card `#f7f9fc`, white boxes inside.
It is deliberately **not** the landing page's `.card`: that one is an `<a>` with a gradient hover,
and a comparison has no single destination to click. A third comparison is another `.subcard`
plus its `GROUPS` entry.

**Groups are the unit of synchronisation.** Clock and camera are per group — the two comparisons
are different scenes with different frame counts, so linking them would be meaningless. The
decoder and the view options are shared across the whole page. Adding a third comparison means
one more entry in `GROUPS` plus its transport ids in the markup; nothing else changes.

**The americano panels render `fit=square`.** The capture camera is 536×960 portrait; the panel
ignores that aspect and renders the full square canvas at the *wider* of the two FoVs, so the
view covers at least what the camera saw on both axes and more on the narrow one. That
deliberately exposes reconstruction outside the filmed frustum, floaters included — it reads as
3D instead of as a replay of the one supervised view. Without `fit=square` the panel letterboxes
to the camera, which is what bouncingballs (already square, 800×800) still does.

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
  still needs them to decode).
- **Motion arrays are cloned too, and freed only when the panel ACKs them** (the `gop` field on
  `buffered`). They were originally *transferred* — cheaper, but it destroyed the host's only
  copy at send time, so a panel that failed to load or had to be reloaded was permanently
  unrecoverable. Do not "optimise" this back to a transfer without replacing the recovery path;
  the retained copy is what makes the watchdog below able to serve a restarted frame.
- **Two load failures are recovered explicitly, because a CDN drops requests and localhost does
  not** — the symptom was one or both canvases blank on the deployed site until a manual refresh:
  - *A panel that never says `hello`* (its document 404'd, or its script threw before
    announcing) is reloaded by a watchdog, cache-busted, up to twice. No message can fix this —
    the protocol needs the panel alive to begin.
  - *The host module itself failing to load.* Module loading is all-or-nothing, so one dropped
    fetch under `../smv/` or `vendor/` means `boot()` never runs and both panels wait for ever.
    A **classic** `<script>` before the module arms a timer that the module clears via
    `window.__spdefBooted`; it cannot be done from inside the module that failed. Keep it
    classic, and keep the flag assignment at the very top of the module.
  - *A panel that is alive but never installed its keyframe* gets the keyframe re-sent rather
    than the whole frame reloaded — cheaper, and it keeps the GL context and any motion already
    delivered.
  - *A hung fetch.* **This was the real cause of the recurring "only 1 of 2 / 2 of 3 canvases,
    and I cannot play".** A CDN request that hangs rather than fails leaves `await rd.read()`
    pending for ever; panels were loaded in sequence, so one hung fetch rendered every earlier
    panel and left every later one blank permanently — a prefix, which is the reported shape.
    Nothing recovered, because those panels *had* said hello and were simply never sent anything,
    and play stayed disabled because `minBuffered()` sat at 0. Fixes, all in `grab()` and
    `loadGroup()`: an **idle** timeout (no-progress, not total-duration, so slow-but-alive is
    fine) with cache-busted retries; panels fetched **concurrently** so one cannot block the
    others; and per-panel failure isolation, so a dead panel costs only itself and the rest of the
    comparison stays playable.
  - *Any other unbounded await.* `ffmpegReady()` (a ~32 MB fetch) and `decodeMotionGopBundle()`
    (a worker round-trip) are wrapped in `withTimeout`. On a decoder timeout the retry must go
    through `recreateFFmpeg()`, since `ffmpegReady()` caches its in-flight promise and would
    otherwise hand back the same hung one.
  - *A backgrounded tab.* The decode loop yielded with bare `requestAnimationFrame`, which never
    fires while hidden — pressing Load and switching tabs froze it mid-group. `yieldFrame()`
    races rAF against a `setTimeout`.
  - `status()` names a panel that has not come up. Silence is what made these look like a
    rendering bug rather than a frame that never loaded.
  - Watchdog timers run from the moment a group is **started**, not from page load — with
    on-demand loading those are no longer the same instant.
- **The decode loop is interleaved by GOP index, not scene by scene**, and recycles the ffmpeg
  primary every 4 decodes (`recreateFFmpeg`) as the SMV loader does. Both are inert on the
  single-GOP scenes shipped today — they are there so a multi-GOP packing can be dropped back
  in without the timeline pinning at 0 or a long decode chain running on one wasm heap.
- Protocol is `{ch:'spdef', …}`, `id` panel→host, `to` host→panel; add a message type to both
  ends or it is silently dropped. Panels re-post `hello` until answered, because a panel's
  module script can in principle run before the host attaches its listener.
- **View options (hard ellipsoids / trajectories / colorize motion) live on the host and are
  broadcast to every panel IN THEIR GROUP** via one `view` message carrying the whole option set.
  Within a comparison they must agree — two scenes under different render settings would be
  meaningless — but the comparisons are independent, so **each group has its own panel** next to
  the thing it affects. Trail max differs for that reason: 150 for bouncingballs, 200 for
  americano. `flush()` re-sends `viewState(p.g)` with the keyframe so a panel that installs late
  doesn't sit at the defaults.
- **The options block is repeated per group, so its controls are addressed by `data-o`, not by
  id** — ids must stay unique in a document. That puts them outside `verify.py`'s id check, so
  `check_repeated_controls()` instead asserts every `.viewopts` block exposes the full key list
  the host looks up. A missing control in one copy is otherwise invisible until someone clicks
  that group's toggle. The panel's handler must invalidate *both*
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
- **Opening elevation is per panel, via `?elev=` degrees** (default 20; americano uses 10 —
  the same angle reads as far more tilt on a close hand-held capture than on a synthetic
  turntable at distance 4). The view is orbited about the world origin, which both cameras aim
  near, so distance and framing are preserved.
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

## `projects/grain/` — the camera-noise playground

Results page for *A Generative Model for Digital Camera Noise Synthesis*
([arXiv:2303.09199](https://arxiv.org/abs/2303.09199)). Ported on 2026-07-28 from
`~/tempformer/playground/` (`index.html` + `styles.css` + `app.js` + `assets/`), which is
itself a static offshoot of the TempFormer repo's Gradio/ONNX demos.

**This page is now the copy that gets polished — it is a fork, not a mirror.** Upstream keeps
its own three-file layout and a `scripts/bundle_playground.py` that inlines the parameters; here
everything is one `index.html` in the site's idiom, so a future upstream change has to be merged
by hand rather than copied. What changed in the port, and why:

- **One file.** Shell markup, the app CSS and the whole app script are inlined, as on the other
  two project pages. It is also what gives `verify.py` its coverage: `check_dom_ids()` reads one
  page's source, so an external `app.js` would have put ~30 element lookups outside every check.
  (The `$('id')` helper is now one of the patterns that check scans for — added in the same edit.)
- **Dark mode dropped.** Upstream themes on `prefers-color-scheme`; both other project pages pin
  `color-scheme:light`, so this one does too. The chart-role tokens (`--series-*`, `--grid`,
  `--text-*`, `--surface-1`) were validated as a set against the light surface — keep them
  separate from the page palette, so retuning one cannot silently drag the other.
- **Palette = neutral graphite + one darkroom-safelight amber.** Third temperature in the family
  (SMV warm, SpDef cool). The accent is deliberately hue-poor: the page's real colours are the
  R/G/B chart series and the photographs.
- **Bundle hooks removed** (`window.__GRAIN_PARAMS__` / `__GRAIN_SAMPLE__`). There is no
  bundler in this repo; the params and sample are plain fetched assets.
- **SIDD camera codes are expanded** in the picker (`CAM_NAMES`) — nobody reads "N6" as a phone.
- **The grain-control sliders are gone**, along with everything that only served them: upstream's
  strength / colour-noise / grain-size / shadow-lift / monochrome controls, `channelGain()`,
  `shapedCurve()`, the `mono` branch in `synthesize()`, the Gaussian-blur branch of
  `effectiveKernel()`, the slider readouts (`SLIDER_FMT` / `syncOutputs` / `bindOutputs`) and the
  Reset button. They made a nice toy but turned the page into a grain *tool*, at which point
  nothing on screen is a measurement of anything. **The preset is now reproduced as measured or
  not at all** — `readControls()` returns `{camera, iso, seed}` and nothing else scales the curve.
  Restoring any of them means restoring its arithmetic too; upstream still has all of it.
- **The explanation cards under *The model* are gone.** The published numbers are already
  generous; the calibration recipe (how the network is probed, why the whitening step comes
  first) is not something this page needs to hand out. What is left is the equation and the two
  chart captions, which describe the data that ships anyway. Do not re-add the method write-up.

**Only summary statistics are published, and it must stay that way.** `assets/grain_params.json`
(~180 KB, 70 presets = 5 SIDD cameras × 14 ISO levels) carries per-channel σ over 17 intensity
knots, a 9×9 correlation kernel per channel, and a 3×3 Cholesky factor for the RGB correlation —
the same quantities the paper plots. **No weights, no architecture, and nothing from which
either could be recovered.** The checkpoints themselves are unpublishable; do not add them, and
do not "upgrade" this page to run the real network (the ONNX path in `~/tempformer/web/` exists,
but shipping it here would publish the generator).

Three invariants in the synthesis math, all load-bearing:

- **`Σk² = 1` after any kernel edit.** `effectiveKernel()` renormalises the tap list, which is
  what makes the convolution preserve exactly the variance the σ curve asked for. Drop it and the
  kernel silently becomes a strength control.
- **σ is evaluated at the *clean* intensity**, and the kernel is applied *after* the scaling.
  Swapping the order correlates the magnitude map instead of the noise.
- **The curve is a 17-knot LUT, not `σ² = aI + b`.** In sRGB it peaks near `I ≈ 0.25` and falls
  toward the highlights; the kernel likewise has negative lobes at distance 2 (an ISP sharpening
  signature). Both are the point of the page, and both are visible in the two charts.

**The busy indicator is not decoration — it is the only thing standing between the visitor and a
page that looks hung.** `synthesize()` is a few hundred ms of straight-line arithmetic on the main
thread, so nothing script-driven can animate through it and nothing painted in the same task ever
reaches the screen. Hence `render()` is `async`: it sets the state, `await nextPaint()`s a
*double* rAF (one only schedules the callback; the paint lands after it), and only then blocks.
The sweep and the pulse are CSS animations for the same reason — the compositor keeps them running
while JS is frozen. Two consequences to preserve: the busy guard now coalesces via `state.dirty`
and re-runs once at the end, because the await window is long enough for a preset change to be
dropped otherwise; and both animations need a static fallback in the `prefers-reduced-motion`
block, which they have.

**`resize` must never reach `render()`.** The image canvases are CSS-scaled and the noise field is
tied to the working resolution, not the viewport, so re-synthesising on resize costs a few hundred
ms to reproduce the identical pixels. Only the two chart canvases genuinely need repainting, and
they repaint from `chartArgs` (the last curves/taps drawn) rather than from a fresh synthesis. The
symptom that found this: **entering or leaving fullscreen visibly recomputed the grain** — a
fullscreen toggle fires `resize` without changing the layout behind it, so the handler now also
drops any event that left the chart width unchanged.

**Regenerating the parameters** needs the unpublished model, so it happens in the TempFormer
repo and the result is copied here:

```bash
cd ~/tempformer && conda run -n TempFormer python -m noise_synthesizer.calibrate_grain \
  --samples 64 --out playground/assets/grain_params.json
cp playground/assets/grain_params.json ~/mingyang-song.github.io/projects/grain/assets/
```

The sample image is a crop of Kodak *kodim16*; it and the landing-page teaser
(`assets/grain_teaser.png`, a clean · G4 ISO 800 · G4 ISO 1600 strip built from
`~/tempformer/assets/kodim16_crop*.png`) are the only imagery, and both are credited in the
page's **Datasets** section alongside SIDD.

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
# americano is the same, from /cluster/scratch/misong/4dre/hyper/misc/<run>/bundle_single_packed
# with that run's scene_config.yaml and --source_path .../datasets/hypernerf/misc/americano/
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
  / `citeBib`). The SpDef page carries its own `citeAcm`/`citeBib` plus a **Datasets**
  section crediting D-NeRF and HyperNeRF — the two it actually uses. Those citations are
  verbatim copies of the SMV viewer's; keep them in sync if either is corrected.
