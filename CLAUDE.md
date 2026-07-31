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

The SpDef page hosts **four independent cards**, all driven by the one host script:

1. **1×2, D-NeRF *bouncingballs*** — the same sequence trained with and without the temporal
   regularizers (`xyz/rot_velocity_div_loss`, `xyz/rot_acceleration_loss`; the two runs'
   `deform_config.yaml` differ in nothing else). 150 frames.
2. **1×3, HyperNeRF *americano*** — a casual hand-held capture, showing knot count as a
   regularizer: 33 knots (`spline_knot_ratio 0.2`, `temporal_capacity 13`) vs the full count
   (`0.9` / `59`), plus full-count with `xyz/rot_velocity_div_loss` zeroed. 200 frames. Note
   the *no-reg* run here zeroes only the velocity-divergence terms, not the acceleration ones
   — unlike the bouncingballs pair, which zeroes both.
3. **1×1, DeformingThings4D *astra / samba dancing*** — not a comparison: the GS-free path, the
   *fitted spline itself*, and a **different renderer**. See the `points.html` section below.
4. **1×1, D-NeRF *bouncingballs* again — the model taken apart.** The canonical gaussians and the
   deformation field's three tri-planes in one scene, which is what makes it the last card: the
   three above show what the field *does*, this one shows what it *is*. A third renderer again,
   and the entrance to `triplanes.html`, which the card links. See the `field.html` section.

**`kind` is the only axis the host branches on** — `'splat'` (the first two cards, `viewer.html`
panels the host fetches and decodes for) versus `'points'` and `'field'` (the last two, panels
that load themselves and need no decoder, so `startGroup()` skips `pump()` and `flush()` sends
them options and a seek rather than data). Anything per-kind — the required view-option keys (`OPT_KEYS`), what `viewState()`
sends, which controls `pushView()` wires (`OPT_WIRING`) — is a table keyed by it, not an `if`
scattered through the file. A group also opts into a **continuous clock** with `frac:true`, which
changes `setFrame()`'s label and lets `tick()` advance in fractional frames.

Optional transport controls are **simply absent from that card's `ui`, resolved to `null`, and
guarded at every use**: `touch` (only the splat cards have a virtual pad), `prev`/`next` and
`speed` (only the trajectory card has supervised-frame steppers and a playback rate). Adding a
control to one kind must not force a dummy into the others. `g.el` is built by walking `g.ui`
rather than by naming keys, and `verify.py` reads the same `ui:{…}` blocks for its id check — so
a new control needs no edit in either place.

Both splat comparisons' five scenes are the **single-GOP** packing: one keyframe,
`overlap_frames = 0`. For
bouncingballs the 4-GOP packing (`bundle_4_packed`) was tried and rolled back — it demonstrates
worse, since a GOP boundary is a hard cut between two independently-keyframed point clouds when
overlap is 0. The loader stays multi-GOP-capable either way.

**Nothing loads until its Load button is pressed.** Six panels is ~18 MB of scenes, six WebGL
contexts and a ~32 MB decoder — too much to spend on a visitor who came for the paper link. Until
a group is started its iframes carry the viewer URL in **`data-src`, not `src`**, so no viewer,
GL context or decoder exists for it. `startGroup()` assigns `src` and enqueues; groups run **one
at a time** through `pump()`, because two quick clicks would otherwise put two decode chains on
one wasm heap and race `disposeFFmpeg()` against a live decode. The decoder is released when the
queue drains and re-acquired (warm cache) if another group is loaded later. `verify.py` reads
`data-src` for asset checking; without that it stopped seeing `viewer.html` entirely.

**Each comparison can also be given back.** `clearGroup()` is the counterpart to `startGroup()`:
four cards already means seven WebGL contexts, seven scenes and every decoded motion array
resident at once, and a fifth would be worse. It navigates each panel to **`about:blank`**, which
*destroys* the panel document — GL context, textures, the motion it was sent, its rAF loop — and
drops the host's own `p.scene` / `p.built` (keyframes are deliberately kept past decode to serve a
panel that reloads, so nothing else frees them). `resetPane()` is shared with first-time init so
the two cannot drift. It is also **Cancel**: `g.gen` is a generation counter that `loadGroup()`
re-checks after every await, so an in-flight pass returns instead of writing into a group that no
longer exists — it returns rather than throws, leaving pump()'s catch for genuine failures. An
in-flight fetch is left to finish and its bytes dropped; aborting mid-stream would poison the HTTP
cache for the reload that usually follows. Three quieting guards go with it: `stage()` no-ops when
`!g.started` (a late fetch must not overwrite the "Not loaded" line), the message handler drops
anything from a cleared group (a `ready` posted just before teardown would re-enable the
transport), and pump()'s catch only reports when the group is still started. Load hides with
**`hidden`, not `style.display`** — Clear restores it with `hidden=false`, which an inline
`display:none` would outrank.

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
- **A scene with no motion renders as-is.** `num_frames: 1` and an empty `streams` (what
  `export_canonical_scene.py` writes — see *Common tasks*) needs no new render path: `motion`
  stays null and the renderer keeps showing the keyframe. The one thing that had to change is
  the standalone loader, which now returns before `ffmpegReady()` rather than fetch ~31 MB of
  wasm for a decode loop that runs zero times. `scenes/bouncingballs_canonical/` is such a scene.
  **The host still cannot load one into a splat card** — `loadGroup()` reads `sg.streams.xyz.path`
  unconditionally — and does not need to: the canonical cloud reaches the page through
  `field.html`, which loads it itself. This guard is what keeps
  `viewer.html?scene=scenes/bouncingballs_canonical/scene.json` working for inspection.
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
- **The virtual movement pad is per group, but only ever on ONE panel of it.** Same control as the
  SMV viewer's (`#vctrl` / `#joy` / `#vbtns`, stick → the WASD axes, ▲▼ → the Q/E axis, folded into
  `moveCam()`), but retinted: the SMV pad is translucent white over a dark scene, which on this
  page's white panel is invisible. The pad has to live *in* the panel — it sits over that canvas and
  drives that renderer's camera — but **ownership is a host decision**, sent as `{type:'touch',on}`
  to every panel in the group, `on:false` included. The cameras in a group are linked, so a pad per
  panel would be N controls for one camera, each covering a third of the comparison. `touchPane()`
  picks the first *live and announced* panel — leftmost in the 1×N grid, topmost once it collapses
  to one column — and `pushTouch()` re-pushes on every hello (via `flush`), every panel failure and
  every toggle, so ownership can move without leaving a stale pad behind. The per-group checkbox
  (`abTouch` / `amTouch`, in the transport, id-addressed since it is not part of the repeated
  `.viewopts` block) **defaults to `(pointer:coarse)`**: with no keyboard there is otherwise no way
  to fly at all, only to orbit. It stays a checkbox because the detection is a guess and the pad is
  useful with a mouse. Hiding the pad must also zero `joyX/joyY/joyUp` or the camera keeps drifting.
  Standalone, `viewer.html` decides for itself, with `?touch=1` / `?touch=0` to force it.
- **The pad's long-press suppression is load-bearing, in BOTH viewers.** Holding a control is the
  normal way to use it, and a hold is also what a phone reads as *select this text* — long-pressing
  ▲ raised iOS's selection callout and magnifier over the scene. `preventDefault()` on `pointerdown`
  does not stop it, because the callout comes off the touch sequence rather than the pointer event.
  What does: `-webkit-touch-callout:none` + both `user-select`s + `-webkit-tap-highlight-color` on
  **`#vctrl` as a whole** (the stick is a hold too, and a selection started on it drags into the
  surrounding text), plus a `contextmenu` `preventDefault()` on the same element for Android's
  long-press menu, which the CSS does not cover. Same four declarations and same handler in
  `projects/smv/index.html`; keep them in step.
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

### `triplanes.html` — the tri-plane inspector (linked from the fourth card)

A lab page for the explanation card's second half: the deformation field's own storage. The
field encodes space as three 128×128×**32** planes and time as 6 weights at 75 knots, and
`DirectGrid4D` composes `base + Σ_r tw_r(t)·res_r`.

**That is affine in the weights, and PCA is linear** — so with one fixed 3×32 basis the RGB
image is affine in the same weights, and **7 images per plane plus the weight table reconstruct
every knot exactly**. Hence a ~1 MB bundle and a continuous slider instead of an 11 MB 75-frame
flipbook. Between knots the page lerps `tw`, which is `DirectGrid4D`'s own continuous-`time_step`
path — **not** what the trained renderer does there: inference reads the field at both bracketing
knots and cubic-Hermite interpolates the predicted *offsets*, which is what the `v_xyz` / `v_rot`
heads exist for. Same knots, different interpolant, and the page says so. `projects/spdef/triplanes/bouncingballs/` is 6 atlas PNGs (7 tiles each,
uint8 with per-tile per-channel min/range — costing 0.2 % of range) + `meta.json`. Built by
`~/4d-relight/scripts/visualization/export_triplanes.py`; the page's compositing was checked
against the checkpoint at continuous t and agrees to ≤0.35 % of range.

Two things are deliberate, against the old `render_canonical_temporal_weights` this ports:
**one basis and one display range for the whole sequence** (per-frame PCA re-derives the axes
and their arbitrary signs every frame, so still regions churn), and **two bases to switch
between** — `composed` fitted to the planes, `motion` fitted to their temporal deviation.

**Occupancy is what makes it readable, and it is not cosmetic.** Most of a plane is cells no
canonical gaussian ever projects into — 49 % of the xy plane, 82 % of xz. The field is
unsupervised there, so its values are arbitrary, large and smooth, and unweighted they dominate
both the PCA covariance and the display range: the old output was the scene as faint texture
inside a wash. The exporter bilinearly splats the canonical cloud onto each plane (the same
mapping the field reads it with), **fits the PCA weighted by that map, takes the display
percentiles inside it**, and ships it as `occ_<plane>.png`; the page fades unsupervised cells to
the card surface. Note the honest side effect: weighting *drops* explained variance from 47–70 %
to 25–36 %, because the background was low-rank and inflated it. The supervised region genuinely
needs more than three components — which is why the default view is not the PCA one.

**Five views, two computations, and one distinction that is easy to get backwards.** `triplanes.html`
offers: *motion at this t*, *motion overall*, *template*, *one residual plane*, *features (PCA)*.
(`field.html` deliberately shows only the last of these — see its section.) The last three are all
`base + Σ_r w_r·res_r`
under different weights — `w(t)`, `⟨w⟩`, or a one-hot with the base dropped — so they are uniforms,
not code paths. The trap: **"motion overall" is not the base.** Both magnitude modes use
`c(t) = w(t) − ⟨w⟩`, in which the base *cancels out entirely*; overall is a summary of the
**time-varying** part, static only because averaging over `t` leaves no `t`. The genuinely
time-invariant plane is *template* = `base + Σ_r ⟨w_r⟩·res_r`. It is shown in the **composed**
basis and the pages switch to it automatically, because the motion basis is centred on the template
and renders it exactly flat — which looks like a bug and is not. A single residual gets its own
display window from the atlas tile's quantisation bounds; it is not on the composed image's scale.

**The default view is a magnitude map, and it is exact.** `‖Σ_r c_r·res_r‖` over all 32 channels
is a quadratic form in the weight deviation `c`, so the 21 upper-triangle entries of the per-cell
6×6 channel Gram recover the whole family: motion at time t (`c = w(t) − ⟨w⟩`), RMS over the
sequence (`⟨c cᵀ⟩`), speed if wanted. That is one more 7-tile atlas per plane and it escapes the
PCA's variance loss entirely. The Gram is stored **companded** as `sign(g)·√|g|` (undone as
`v·|v|`): the form has cancelling terms, so a uniform 8-bit grid spends its whole error budget on
the largest entries and mottles exactly the low-motion cells the map exists to distinguish — 4 %
of display range plain, 1.6 % companded, same bytes.

### `field.html` — canonical cloud + tri-planes in one 3D scene (a THIRD renderer)

The fourth card's panel: both halves of the model in the coordinates they are stored in. The
renderer core (EWA splatting, the 16-bit depth bucketing) is lifted from `viewer.html`. It is a
third renderer **on purpose** — it carries a shader branch the comparison panels must never grow,
and `viewer.html` is what the two published comparisons depend on.

- **It is a panel, not a page.** Chrome-less, `{ch:'spdef'}` protocol, `?scene=&tri=&id=`, driven
  by the host's transport exactly as `points.html` is — including the standalone fallback that
  runs its own clock so one panel stays debuggable alone. The host's Load/Clear applies: nothing
  is fetched until asked, and Clear navigates the frame to `about:blank`.
- **Orbit, not fly, and no virtual movement pad** — the same argument `points.html` makes. One
  object on a turntable needs orbit/pan/dolly, and unlike a fly camera that vocabulary is fully
  reachable by touch, which is the only reason the pad exists. The opening pose is the dataset's
  test camera converted to orbit state (the D-NeRF cameras aim at the origin, so the target is the
  origin), raised by `?elev=` and pulled back by `?zoom=`. The renderer's basis convention is
  `viewer.html`'s — r/u/f as the view matrix's columns with **u pointing DOWN the screen**, since
  the projection flips Y — so `camBasis()` builds the triad directly and there is no quaternion.
  Checked offline: handedness `cross(r,u)·f = +1`, orthonormal, and the framing matches the pose
  the earlier quaternion camera produced.
- **The timeline is the sequence's 150 frames**, `frac:true`, from `meta.num_frames` — which the
  exporter recovers from the sealed `deform_config.yaml` by inverting
  `capacity = floor(num_time_steps · knot_ratio / interval_stride)`. The panel maps a seek to
  `t = frame/(frames-1)`. Do not hardcode a frame count in the markup; a re-export would drift.

- **One texture, one sort, one draw call, split by index.** Below `u_planeStart` a gaussian is a
  canonical one and carries its own colour (plus SH); at or above it, `cen.w` is a packed
  `plane<<28 | cellX<<14 | cellY` and the colour is computed **in the vertex shader** from the
  atlas textures. Sheets and cloud therefore occlude each other correctly — they are one sorted
  splat pass, which is the reason the sheet cells are gaussians rather than textured quads.
- **Scrubbing time costs six uniforms** (`u_w[6]`) — no texture upload, no CPU compositing. The
  splat texture is built once. This is the whole reason for the affine-in-the-weights property; do
  not "simplify" it into a per-frame repack.
- **One view, on purpose: the plane at time t** (`G(t) = base + Σ_r w_r(t)·res_r`, PCA-projected in
  the **composed** basis, `BASIS` at the top of the module). This panel is a teaching figure, not an
  inspector — the magnitude maps, the template, the per-residual planes and the basis switch all
  live in `triplanes.html`, and the sheets here would only invite the reader to compare readings
  instead of watching the field move. So `field.html` fetches only the three `composed_*` atlases
  and the occupancy maps (~470 kB, one 896×384 RGBA32F texture); the Gram and the motion basis are
  never loaded, and the shader has no magnitude branch. The exporter still writes all of it.
- **There is deliberately no bounding-box wireframe.** It was there to prove the sheets sit on the
  field's own AABB; that is now settled (and checked offline), and on a teaching figure the box
  read as scene geometry. The line program went with it — do not re-add one without a reason.
- **Alignment is by construction and must stay that way.** Sheet cells sit on the faces of the
  field's *own* AABB (from the checkpoint's `aabb_min/max`, which `meta.json` carries), addressed
  by the same `lo + (hi-lo)·i/(n-1)` mapping the field reads them with — `xy` on the low-z face,
  `xz` and `yz` on their high faces, as the original `render_gs.py` figure did. Nothing is fitted
  or re-centred. Verified by re-rendering the scene in numpy: each sheet's occupied cells are the
  cloud's shadow on that face.
- **`alpha:true` + `premultipliedAlpha:true`, cleared to (0,0,0,0).** The splat blend is a
  front-to-back `under` operator (`ONE_MINUS_DST_ALPHA, ONE`); clearing to opaque white leaves
  `DST_ALPHA` at 1 and multiplies every splat by zero — a blank canvas. The panel's white
  background comes from the `.stage`, through the canvas.
- Cells below `occupancy.threshold` are **not emitted at all** (~14.5 k sheet cells survive out of
  49 k), and the rest carry occupancy as their alpha, so the sheets fade out exactly where the
  field stops being supervised.
- The camera is the scene's test camera, raised by `?elev=` and **pulled back by `?zoom=`
  (default 1.42)** — the field's box is much wider than the cloud, so the dataset framing crops
  the sheets.

**Shaders are checked, not hoped for.** `glslangValidator` from the Khronos release compiles both
(`#version 300 es`) clean, and a deliberate typo was confirmed to fail — a shader error blanks the
panel and nothing else on this site would catch it. The atlas→texture layout and the shader's
`texelFetch` indexing were separately checked against the checkpoint (≤2 % of display range, i.e.
quantisation only). Do the same after touching either.

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

### `points.html` — the point-trajectory card (a SECOND renderer)

Ported on 2026-07-31 from `4d-relight/web/player_points/` (`index.html` + `traj.js`), scene
`bundles/humanoids/astra_samba_09_u8_mesh_s4` → `projects/spdef/points/astra_samba/`. It is the
demo for the **GS-free** path (`scripts/train/run_anime_trainer.py`): the deformation field fitted
straight to a DeformingThings4D `.anime` vertex sequence, with no rasteriser in the loop.

`points.html` and `viewer.html` share the `{ch:'spdef'}` protocol **and nothing else** — different
shaders, different data model, no decoder. Do not try to merge them.

- **What ships is the spline, not a replay.** Per-point offset + tangent at each of 105 knots;
  `traj.js` evaluates the same cubic Hermite the field uses, so the timeline is *continuous* and
  every frame between the supervised ticks is inferred in the browser. That is the whole claim of
  the card, which is why the group carries `frac:true` and the frame readout says
  `· supervised` / `· inferred`, and why ⇤/⇥ step trained frames (`train_frames`, sent by the
  panel on `ready`) — scrubbing lands on one only by accident.
- **`traj.js` is a VERBATIM copy of the upstream module** and mirrors `traj_codec.py` /
  `point_deform.py`. Every bundle carries a torch-computed `parity` block; the panel refuses to
  render if it disagrees, the same contract the splat path has with `compression/decoder.py`. Do
  not edit the curve math here — edit it upstream and re-copy.
- **The PANEL loads its own bundle, unlike every other panel on the page.** The host owns loading
  for splat scenes only because a decoder per canvas is four copies of a ~32 MB ffmpeg core. There
  is no wasm here at all, and `traj.js` already streams the two knots bracketing the playhead with
  its own LRU cache; hoisting that into the host would mean shipping knots over `postMessage`
  every frame. So `startGroup()` **bypasses `pump()`** for a points card — queueing it behind a
  splat decode would make it wait ~30 s for a resource it never touches — and the host's only jobs
  are starting the frame, relaying `progress`, and catching a late/restarted panel up in `flush()`
  (which for this kind sends `viewState` + a `seek`, and returns before the keyframe path).
- **The eager load is 0.21 MB** (meta.json + canonical + faces); knots are ~48 KB per pair,
  fetched on demand, so initial load is flat in sequence length. Every fetch goes through an
  **idle-timeout wrapper with cache-busted retries**, injected as `traj.js`'s `fetchFn` — the same
  lesson as the host's `grab()`, and the reason `hardFetch` drains the body itself rather than
  handing back a real `Response` (the idle clock has to cover the read, not just the headers).
- **Z-up.** DeformingThings4D is z-up — the canonical bounds settle it (tall axis spans 1.18
  against 0.43/0.48) — and the character faces **−Y**. The upstream player orbits about world Y,
  which lays it on its side. Opening pose is `?yaw=`/`?pitch=` in degrees (146/10), same idea as
  `viewer.html`'s `?elev=`.
- **Orbit, not fly, and no virtual movement pad.** One character on a turntable needs only
  orbit/pan/dolly, and unlike the fly camera that vocabulary is fully reachable by touch (drag,
  two-finger pinch and pan) — which is the thing the pad exists to work around. Hence no
  `touch:` id in this group's `ui`.
- **Retinted for a white panel, except the surface.** Upstream is a dark standalone page, so its
  pale cloud and pastel stripes are invisible here. The surface shading `abs(n*0.5+0.5)` off
  screen-space derivatives is deliberately left alone: it is the same convention as
  `utils/mesh_render.py`, so a web frame and a paper figure still look alike.
- **The panel opens one trail-length in** (`openAt` on `ready`), because a trail covers the past
  and frame 0 is the one state where the card's main feature has nothing to draw. It also refuses
  to draw at all until the first successful `evaluate()` — `positions` is zero-filled before that,
  and drawing would paint the mesh collapsed to the origin.
- **The ground-truth overlay was dropped, data and all.** The export carries GT at every 60th
  frame only (`--gt_stride 60`, 14 of 837), so the checkbox did nothing at 98 % of the timeline.
  Removing it let **`arrays.gt` come out of `meta.json` and `gt.bin` off disk** — 665 KB, which
  was 80 % of what the card fetched before you touched anything. `traj.js` fetches GT only when
  the manifest declares it, so no code there had to change. Restoring the overlay means putting
  the file and its meta entry back as well as the control; a checkbox alone will find no data.

**What is deliberately NOT a control here** (upstream ships all three as sliders/checkboxes):

- **Knot stripes are always on** (`STRIPES` in `points.html`). The colour flip *is* the knot, and
  it is the one thing on screen that shows the spacing the paper argues about; a trail in one
  colour says nothing the mesh did not already say. Stripe pair is **`#59B292` / `#FA6781`**.
- **Sample density is fixed at `DETAIL = 5`.** It trades a cost nobody can see against smoothness
  everybody can. Note the *peak* cost is set by `MAX_TRAIL_SAMPLES = 256`, not by DETAIL: the cap
  binds from length ≈ 51 upward, so raising DETAIL from 3 to 5 moved the *low* end of the slider
  up (6.1 → 10.4 MB per rebuild) and left the ceiling at ~12.9 MB. That ceiling is the number to
  watch if `TRAIL_POINTS` (1500) or the cap is ever changed.
- Trail alpha is **0.65**, further multiplied by `vAge` in the shader. 1500 overlapping polylines
  at full strength wash out the mesh they are drawn over.

**Playback rate (`g.rate`, the Speed slider) exists only on this card, and that is the point.** A
splat scene has exactly one decoded pose per frame, so slowing it down can only repeat them; the
spline evaluates poses that were never stored. `tick()` uses `g.rate` for a `frac` group and the
shared `FPS` elsewhere. It survives Clear, like the view options — a preference, not scene state.
The slider carries **percent and the label shows a multiple** (`1.00×`); an absolute fps readout
was tried and read as a rendering setting rather than a playback one.

**The status line reports streamed bytes as a fraction, not a running total.** `bundleBytes()` in
the panel derives the whole sequence's size from `meta.json` (`arrays[].bytes`, plus
`num_points × 3 × CODE_BYTES[dtype]` per knot) and sends it as `totalMB` on `ready`; the panel's
1 Hz `stats` carries `mb` and the host refreshes the status line on each. Derived rather than
hardcoded so a re-export cannot make the page lie. A counter that only ever goes up is
indistinguishable from one that never stops, which is the wrong impression for a page whose whole
argument is that initial load does not grow with sequence length.

**Three size figures have to agree, and one of them is manual.** `bundleBytes()` and the
`fetchedBytes` counter both **include meta.json** — `hardFetch` counts every request and stashes
the first one's size as `manifestBytes`, because `traj.js`'s own `bytesFetched` starts at
`loadEager()` and misses the 46 KB manifest. The Load button, the subtag and the lede state
**5.0 MB total / 0.2 MB up front** as literal text; nothing checks those against the bundle, so
re-exporting means re-reading them. Current split: manifest 46 KB + canonical 47 KB + faces
120 KB eager, 105 knot pairs × 48 KB streamed.

**The mesh is decimated ≈4× and that is stated on the page** — 31,515 vertices → 7,921, via
`--decimate_to 7879` (`cluster_decimate()` clusters and remaps faces, so a surface survives). Do
not conflate it with `skip_step = 4`, the *temporal* subsampling that makes every 4th frame a
supervised one: both are "×4" and they are different axes.

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
- **Exactly one grain control, and the distinction is the point.** Upstream's colour-noise /
  grain-size / shadow-lift / monochrome sliders are gone, along with everything that only served
  them: `channelGain()`, `shapedCurve()`, the `mono` branch in `synthesize()`, the Gaussian-blur
  branch of `effectiveKernel()`, the `SLIDER_FMT` / `syncOutputs` / `bindOutputs` readouts and the
  Reset button. Those *reshape* the measured curve, and once reshaped nothing on screen is a
  measurement of anything. What is kept is a scalar **strength** on the finished field
  (`clean + strength × noise`, folded into the curve once by `scaledCurves()`): it leaves the
  intensity response, the channel balance and the spatial correlation exactly as measured, so
  **1.00× is still a real reading** — hence the `<datalist>` tick and the "as measured" readout at
  that point, and the `_x1.50` in the download filename when it is not. `readControls()` returns
  `{camera, iso, strength, seed}`. Adding a control that reshapes rather than scales puts the page
  back where it started; upstream still has the arithmetic if you ever want it.
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
page that looks hung**, and it has two modes for two different situations.

*Indeterminate* (image decode) is a CSS sweep: the browser gives no progress from a fetch/decode,
and a script-driven animation would freeze the moment synthesis began. *Determinate* (synthesis)
is a real bar, and it only works because **`synthesize()` is `async` and walks the image in row
bands**, yielding whenever it has held the thread for more than `SLICE` ms. A single blocking call
can paint one frame before it starts and nothing after, however the bar is styled — so the
chunking is what makes the progress bar possible, not an optimisation on top of it. `.stage.pct`
switches modes; the fill is a `scaleX` transform so each update stays on the compositor.

Four things to preserve:

- `render()` still `await nextPaint()`s a *double* rAF before starting (one rAF only schedules the
  callback; the paint lands after it), or the bar appears after the work it measures.
- The yield is `yieldFrame()`, which **races rAF against a timer**. rAF does not fire in a
  backgrounded tab, so yielding on rAF alone strands the loop the moment the visitor switches away.
- The timing readout subtracts the time parked in yields (`waited`), or chunking would look like
  it made synthesis slower.
- `state.dirty` coalesces: the await window is long enough to drop a preset change otherwise. The
  strength slider listens on `input` for its readout but renders through the debounce, so dragging
  the range queues one synthesis rather than sixty.

Both animations need a static fallback in the `prefers-reduced-motion` block, which they have.

**`state.run` is a generation counter, and every async path must respect it.** Once synthesis
yields, *Clear* can land in the middle of one — and the run would then finish and draw its frame
onto a canvas the visitor had just emptied. Same for a decode still in flight. So `clearAll()`
bumps `run`, and `render()`, `handleFile()` and the *Sample* handler each capture it and drop
their result (and their error, and their progress updates) if it has moved on. Any new await in
this file needs the same check. `clearAll()` deliberately leaves the controls and the charts
alone: camera / ISO / strength / seed are a setup worth carrying to the next image, and the
charts describe the preset rather than the picture — the same reasoning as `syncViewOptions()`
on the SMV side.

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

**Two different pictures, on purpose.** The *Sample* button loads `assets/grain_example.jpg` — one
of Mingyang's own illustrations ([pixiv](https://www.pixiv.net/artworks/142575987)) — because a
drawing carries no sensor noise of its own, so the whole before/after is the model's doing and
nothing is being piled on top of grain that was already there. The landing-page teaser
(`assets/grain_teaser.png`, a clean · G4 ISO 800 · G4 ISO 1600 strip) is still built from Kodak
*kodim16* via `~/tempformer/assets/kodim16_crop*.png`. **So the Kodak credit has to stay** as long
as that teaser does — it now names the teaser rather than the sample. Both, plus SIDD, are in the
page's **Datasets & credits** section.

Note that `SAMPLE_URL` / `PARAMS_URL` are consumed through variables, so no `src=` or `fetch('…')`
literal ever names them; `verify.py`'s `local_refs()` grew a `_URL = '…'` pattern so a moved or
renamed asset still fails the check instead of only failing in the browser.

## Git LFS (read before touching scenes)

Scene binaries are in **Git LFS** (`.gitattributes`): `*.mkv` and `*.npz`. The
ffmpeg `*.wasm` is a plain binary git object, not LFS.

- Clones and CI must run with LFS smudge enabled or scenes are pointer stubs
  (`.github/workflows/pages.yml` already sets `lfs: true`).
- Pages serves the built artifact from its CDN, so visitor traffic costs no LFS
  bandwidth — only CI checkouts do.
- **`projects/spdef/points/**/*.bin` is deliberately NOT in LFS.** LFS pays off for a few large
  files; this bundle is 214 files averaging 23 KB (one per knot per component — see the
  build's reasoning in `web/README.md`), and 6.7 MB total. As plain git objects that costs
  nothing recurring; in LFS it would be 214 objects re-downloaded on every CI checkout, against
  a monthly bandwidth quota, for no packing benefit. If a much larger point bundle is ever
  added, revisit — but scope any rule to that path, since `*.bin` is far too generic a glob for
  this repo.

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

**Repackage the SpDef point bundle** (the third card) — different builder, different repo path,
no camera to embed (it is framed from the AABB):

```bash
conda run -n smv python ~/4d-relight/web/player_points/build_point_bundle.py \
  --model_path /cluster/scratch/misong/4dre/anime/x4/astra_SambaDancing_09 \
  --name humanoids/astra_samba_09_u8_mesh_s4
# then copy web/player_points/bundles/<name>/ -> projects/spdef/points/astra_samba/
# and strip meta.json's source_path / model_path to their basenames: as built they are the
# cluster's absolute paths, and this is a public site.
```

**Export a canonical cloud** (for the explanation card — the model's *canonical* Gaussians, the
thing the deformation field moves, as a one-frame static scene):

```bash
cd ~/4d-relight && PYTHONPATH=. conda run -n 4dre python \
  scripts/visualization/export_canonical_scene.py \
  --model_path /cluster/scratch/misong/4dre/dnerf/bouncingballs \
  --out ~/mingyang-song.github.io/projects/spdef/scenes/bouncingballs_canonical \
  --camera_from projects/spdef/scenes/bouncingballs_reg/scene.json \
  --check /cluster/scratch/misong/4dre/dnerf/bouncingballs/bundle_1_packed/gop_0/reference.npz
```

It quantises onto the **training grid** (bit widths and `quant_scene_scale` read from the model's
sealed `online_quantizer_config.yaml`, SH-rest committed to the trained codebook), so the cloud
is decoded by the same path as every other scene here. `--iteration` defaults to the latest,
which is the one the shipped bundles were compressed from — 20000 for bouncingballs, 14,534
gaussians. Note that a **bundle's `reference.npz` is not this**: it is the deformed state at the
GOP's start frame, sorted and padded to a square, so only the grid, the codebook and the
time-invariant attributes are comparable — which is exactly what `--check` compares, and they
match exactly. `--camera_from` copies the held-out test camera out of an existing `scene.json`
rather than re-extracting it, so the canonical panel opens on the same pose as the comparisons
above it.

`traj.js` must be re-copied verbatim alongside any bundle whose format changed — `meta.version`
is a hash of the metadata and cache-busts every binary URL, but it cannot cache-bust a decoder
that no longer matches. The bundle's `parity` block is what catches that, on load, in the browser.

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
  section crediting D-NeRF, HyperNeRF and DeformingThings4D — the three it actually uses. The
  first two are verbatim copies of the SMV viewer's; keep them in sync if either is corrected.
  A new card means a new entry here, not just new markup.
