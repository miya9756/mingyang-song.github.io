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

Under *Elsewhere* it also links two image-backed cards: the external Pixiv gallery and
`misc/` (**Miscellany**), a shelf for things that belong to no project. That page is not a
project page — it borrows the landing page's warm paper rather than picking a temperature of
its own, since it is a continuation of the personal site rather than a new destination, and it
carries only the family bones (Fraunces headings, back pill, footer). It holds a shelf whose one
item is `misc/museum/` (**Digital Museum**, below); a second item is another `.marquee` anchor in
that list and nothing else.

**The shelf is drawn, and it is drawn in CSS.** `.shelf` is a case: two hairline uprights, a thin
board at the top (its underside — you see the edge, not the top), a 3px board under every item, and
a soft cast shadow below each board. Three tokens carry it (`--board-top`, `--board-face`,
`--board-cast`), so it follows the palette rather than baking colours into an asset, and it stays
crisp at any zoom. **The boards overhang the uprights by 5px and that is the whole trick** — a box's
edges meet at the corner, a shelf's board runs past its sides, and without the overhang the case
reads as one more bordered rectangle. The overhang is 5px on both the top board (`left/right:-6px`
off `.shelf`'s padding box) and the item boards (`-26px` off `.marquee`'s, which is inset a further
20px by the case's padding) — change one and you must change the other or the case goes crooked.
Every item brings its own board, so the case grows a compartment per entry with no extra markup.
Kept deliberately suggested: no wood texture, no bevel, no shadow under the case itself.

**A shelf item is TYPE, not a tile — do not give it back the card chrome.** It was a bordered box
with an `<h3>`, a line of prose and an arrow, which is precisely the landing page's `.card`, and
repeating it here made the shelf read as a fourth section of published work. A `.marquee` has no
box, no surface and no lift: hairline rules above and below, a small uppercase kicker, and the
title set at `clamp(34px,7.5vw,64px)` Fraunces so the words *are* the object.

The title's letterforms are a **window onto what they link to**: `assets/museum_type.jpg`, a render
of the actual reconstruction, clipped to the glyphs with `background-clip:text` and revealed on
hover or focus (always visible under `@media(hover:none)`, since a touch screen has no hover).
Three things are load-bearing:

- **Both the image and the clip live inside `@supports`.** Without `background-clip:text` the image
  would paint as a plain rectangle behind the words — the failure is ugly rather than absent, which
  is why the landing page's unguarded gradient-text usage is not the model to copy here.
- **The resting state keeps an opaque `-webkit-text-fill-color`** over the clipped image, so the
  picture appears only on the reveal; both `color` and `-webkit-text-fill-color` are set and
  transitioned, per the site rule that Safari ignores `color` alone on clipped text.
- **The fill was measured as TEXT before shipping**, because every pixel of it is a glyph on
  `#f4f2ec` paper: blended toward `--ink` at 0.45 with saturation restored, it comes out at worst
  **3.5:1**, median **10.3:1**, so it clears the 3:1 bar large text must meet even at the brightest
  point of the painting. Re-measure if the render is replaced — the raw render was 1.9:1 and would
  have failed. It is built by the offline preview renderer, not by the page. Its cover is
`assets/misc_card.jpg`, applied by a `.card.art.misc` modifier that overrides the image and focal
point only — the scrim, the hover drift and the text colours stay shared with the Pixiv card.

## `misc/museum/` — two works, hung one at a time

**`SCENES` is the wall.** Everything that differs between works — the bundle URL, the picker name,
the canvas's `aria-label` and the entire wall label — is one entry in that array at the top of the
module, and the label is *built* from it (`renderLabel`) rather than written in the markup. Hanging
a third work is an entry and nothing else. The two currently hung:

| | `kunst` | `kunst_02` |
| --- | --- | --- |
| work | Bellotto, *Ruins of the Kreuzkirche*, 1765 | Esaias van de Velde, a **pair** of octagonal panels, 1622 & 1625 |
| capture | 33.6 s video, 170 frames registered | video, 170 of 200 frames registered |
| gaussians | 94,148 fitted → **86,277** pruned | **24,719** pruned |
| bundle | 2.4 MB | 0.77 MB |
| roll | none | +1.77° (panel centres) |
| label source | the museum's catalogue records | **the gallery's wall label only** |

**A third work was staged and then dropped.** `kunst_03` (Jan van Goyen, *Fischerboote beim Abrüsten
am Abend*, 1655, 42,877 gaussians, 1.25 MB, from
`/cluster/scratch/misong/4dre/static/kunst_03/bundle_pruned_packed`) was hung on 2026-08-12 and
removed the same day: the capture itself is deficient, not the framing. The bundle is still in
scratch, so re-staging is the usual two commands if it is ever re-captured — but do not put the old
capture back.

**`kunst_02` is a private loan, and that is why it carries no links.** Its plaque reads *Leihgabe
Schweizer Privatsammlung, 2016*, and the Kunsthaus's own site explains what that is: the **Knecht
Collection**, 45 Dutch and Flemish old masters that came to the museum in 2016 as a permanent loan
from a private collection and hang in the Moser building. It does **not** name the individual works,
and the museum's online catalogue lists what it *owns* — so this pair cannot be cited from a record,
and its label is the gallery's wall text, marked as such. Do not upgrade that inference into a
citation. (The same line was on the dropped `kunst_03` plaque, so expect it again on that wall.)

**The labels are sourced differently and the page says so.** The Bellotto is in the Kunsthaus
online catalogue, so its label is reconciled against it and cites it. The van de Velde pair is
*Leihgabe Schweizer Privatsammlung, 2016* — a private loan, which is **not** in the museum's online
collection (that lists owned works) and **not** in Google Arts & Culture either; both were searched
on 2026-08-12 and neither has it. So that entry carries `refs:[]` and a `note` reading *Transcribed
from the gallery label*, which `renderLabel` shows in place of the links. **Do not invent an
inventory number for it** — a web search will offer a plausible-looking `D.2016-…` accession that no
primary source confirms.

Two smaller things about that label: the German titles' first words (*Dorf*szene, *Landsch*aft) are
**reconstructed** — every capture frame cuts the plaque's left edge — from the visible fragments plus
the English lines beside them, and the reading is consistent but not photographed. And the pair is
**public domain regardless of the loan**: van de Velde died in 1630, and owning a panel is not owning
a copyright in it. What a loan can carry is the gallery's *photography policy*, which is house rules
between the visitor and the museum, not a licensing question the page can settle.

A **static** Gaussian-splat capture of a framed Bellotto in a gallery, shown and nothing else.
Provenance, since none of it is stated on the page any more (see the *keep it a card* note below):
a **33.6 s handheld video** (`/cluster/scratch/misong/datasets/my_static/kunst.mp4`) → 200 frames
sampled, blurriest 15 % dropped, **170 registered** by COLMAP (all of them; `preprocess_meta.json`
records this) → **94,148 gaussians fitted, 86,277 after pruning** the wall away → **2.4 MB**
(`reference.npz`, 2,396,760 bytes). Do not describe the capture as photographs; it is one video pass. Ported on 2026-08-11 from
`~/4d-relight/web/demo/` (`index.html` + `build_demo.py`), scene staged from
`/cluster/scratch/misong/4dre/static/kunst/bundle_pruned_packed`. The renderer core (shaders,
`RGBA32UI` splat texture, full-range bucket sort) is that page's verbatim; the **decode path is
imported, not copied** — `../../projects/smv/decode.js`, whose own `./vendor/fflate.js` resolves
module-relative, so there is one copy on disk. No ffmpeg: a static bundle is one GOP with no
offset streams, so nothing on this page touches wasm.

- **The bundle is the PRUNED one — the gallery wall was removed before packing.** That is what the
  whole page design rests on: the splats stop at the gilt frame's outer edge, so the painting can
  hang on the paper with **no canvas frame at all** — no border, no radius, no dark viewport box.
  The GL context is `alpha:true` + `premultipliedAlpha:true` cleared to `(0,0,0,0)`, for the reason
  `field.html` documents: the splat blend is a front-to-back `under` operator, so an opaque clear
  leaves `DST_ALPHA` at 1 and multiplies every splat by zero. Staging an unpruned bundle here would
  put a rectangle of wall back on the page and the design would have to change with it.
- **The opening view is derived FROM THE PAINTING, not from a dataset camera**, which is why
  `scene.json` carries `"camera": null` and none has to be embedded or kept in step. The pruned
  cloud is a slab (measured on the shipped scene: std **2.28 × 1.65 × 0.12**), so its principal
  axes *are* the picture plane: the largest two span the picture, the smallest is its normal.
  `frameScene()` runs a **cyclic Jacobi eigensolver on the 3×3 covariance** (`eig3`) and reads the
  up axis, the normal, the 0.5/99.5-percentile extents and hence the fit distance off it. Signs are
  fixed by the capture: world up is `-y` for these COLMAP scenes, and the photographer stood on the
  `-z` side of the wall. **`eig3` was checked against numpy's SVD on the shipped cloud — axes agree
  to 0.0000°.** Re-check it the same way if it is touched; a wrong basis opens the page on the
  painting's edge and nothing else would catch it.
- **`roll` is the one thing the principal axes cannot know, and it is measured, not eyeballed.**
  PCA levels the point *cloud*; for a pair of panels the second axis is set by how the mass happens
  to sit, so it can disagree with the line through the panels' own centres — on `kunst_02` by
  **1.77°**, small enough to read as a mistake and large enough to see. The `SCENES` entry carries
  `roll` in degrees and `frameScene()` rotates the up axis about the normal (Rodrigues) before
  anything else is derived from it, so the extents and the fit follow the rolled frame rather than
  measuring a box the view is not in. **Positive is clockwise on screen** — `nr` points at the
  viewer, so turning the camera's up anticlockwise turns the scene the other way.
  **How the number is obtained depends on what the work is, and there are two recipes.**

  *A single rectangular frame — the recipe to use for the next one, validated on the dropped
  `kunst_03`:* measure the frame's own edges, by sweeping the rotation and taking the angle whose
  robust (0.5/99.5) bounding box has the **smallest area** — a rectangle's own axes are the ones
  that bound it tightest. A second, independent estimator agreed to the sample step there: the angle
  maximising the share of the outline lying within a thin band of the box edges. At that angle the
  box was **13.2 % tighter** than at the PCA angle, i.e. PCA was 7.8° out — deep carved mouldings
  put a frame's mass nowhere near its silhouette, which is exactly when PCA fails. The minimum was
  sharp to about ±0.5°, and applying the roll returned a residual of +0.000° (against −15.650° with
  the sign flipped). A single rectangle needs no `centre`: once level, the extents midpoint and the
  fitted rectangle's centre agreed to 0.0001.

  *A pair of panels (`kunst_02`, +1.77°):* there is no single rectangle to fit, so use the line
  through the two panels' centres. Split the cloud at the widest gap along the wide axis, then fit
  each panel's centre by its **support function** (the midpoint of the projection onto each of 36
  directions, least-squares solved). That is content-independent,
  which matters — a brightness centroid is pulled by whichever painting has more sky, and the plain
  centroid is pulled by whichever has more frame; on this pair those two estimators give +0.3° and
  −0.05° against the true 1.77°. **Verified by applying the page's own roll block and re-measuring:**
  +1.77° leaves a residual of 0.013° (0.05 px), 0° leaves 1.774° (7.6 px), and the wrong sign
  doubles it to 3.54°. At `roll:0` the new derivation reproduces the old half-extents to 4e-16 on
  both works, so adding this changed nothing about the Bellotto.
- **`centre` is its counterpart for where the camera LOOKS**, and it exists for the same reason: the
  extents midpoint centres the picture's bounding *box*, which is not what the eye centres on when a
  work is two panels of unequal size. `kunst_02`'s right panel is the larger (outline radius 1.51
  against 1.30), so the box centre sits **0.087 to its side** of the midpoint between the two
  panels' own centres; `centre:[-0.087,0]` shifts the view onto that midpoint. The vertical
  component is 0.000 — `roll` had already levelled it. Same support-function measurement, stable to
  ±0.003 over 0.5–2% thresholds. **Verified end to end**: with both applied, the midpoint of the two
  panel centres lands on the canvas centre to **0.0 px**, against (−6.8, +3.5) px with neither.
  Two things about the implementation:
  - **The half-extents are measured about the view centre, not as half the box**
    (`max(hi-m, m-lo)`), so an offset centre can never push the far side of the picture outside the
    fit. With no offset the two expressions are equal by construction, which is why this is inert on
    a work that needs no shift.
  - That does cost a little framing: `kunst_02`'s halfW goes 2.893 → 2.980 and the camera stands
    back 4.95 → 5.10, i.e. the pair arrives about 3 % smaller. That is the correct trade — it is
    what guarantees nothing clips — and not a number to tune out.
- **The turn is clamped to ±45° on both axes** about that opening view (`LIM`), and zoom
  (0.42–2.4× fit) and pan (`panMax`) are bounded too. The capture is a shallow arc in front of one
  wall: a free turntable spends most of its range showing the back of a slab no photograph ever
  saw. It was 60° first and came down after looking at it — at 60 the floaters off the frame's edge
  come into view, so the limit is set by where the reconstruction stops holding up, not by a round
  number. **It is not the edge of what was observed, and the page must not claim that it is** — that
  claim was on the page and was wrong. Measured on the 22 held-out views: the pass covers **±71° of
  yaw** but only **+21°/−35° of pitch**, always close in (3.1–6.4 units from the picture centre,
  against an opening distance of 6.3). So yaw is bounded well inside the observed arc and pitch is
  the axis that actually runs out. Re-measure if the scene is re-captured or re-pruned.
- **`FIT` (1.40) is the opening framing and is deliberately loose.** It was 1.12, i.e. the picture
  just filling the canvas, and that clipped the silhouette: the outermost splats are large and
  nearly transparent, so they reach well past the 99.5-percentile extents the fit is computed from,
  and the canvas edge cut them off in a straight line. 1.40 opens that out by a further 25% — the
  picture arrives at 80% of the size it did — so the soft edge falls off on paper instead. It is a
  framing constant, not a property of the scene, which is why it is not folded into the extents. `resetView()` is the counterpart — bound to the *reset view* button, double-click, `0` and
  `Home` — and `touched` is what makes `resize()` refit only while the visitor has not moved yet.
- Keyboard arrows turn it under the same clamp, so the object is reachable without a pointer. The
  canvas deliberately carries **no `role="img"`** (it is focusable and drag-turnable; a static image
  role would say the opposite) and `#status[hidden]{display:none}` is load-bearing — `display:flex`
  on the author rule would otherwise outrank the UA's `[hidden]`.
- **There is an easter egg, and it is NOT documented on the page.** Press and hold for two seconds
  without moving and the picture comes apart into the gaussians it is made of: each splat hardens
  from its soft EWA footprint to the ellipsoid's silhouette and is squeezed to `EGG_SQUEEZE` of its
  radius, spreading out from the press point until it has crossed the whole picture. It holds while
  the press does; releasing runs the front back the way it came and the painting reassembles. Do
  **not** add it to the `.hints` row or the canvas's `aria-label` — that row is the visitor-facing
  contract for the controls, and an egg named in it is not an egg. Everything tunable is a named
  constant in one block (`EGG_HOLD_MS`, `EGG_OUT_MS`/`EGG_BACK_MS`, `EGG_FRONT`, `EGG_SQUEEZE`,
  `EGG_HARD_R`); `EGG_SQUEEZE` is the one to nudge if the dissolved state reads wrong — too low and
  the splats go sub-pixel and sparkle, at 1.0 only the edge hardens. What is load-bearing:
  - **It is free when idle, so the uniforms LOOK dead and are not.** `u_waveR` is 0, so every
    splat's phase clamps to 0 and the squeeze is 1 — the picture is bit-identical to before the egg
    existed. Do not delete `u_seed`/`u_waveR`/`u_waveW`/`u_squeeze` as unused, and do not fold the
    phase into a CPU pass: nothing about the scene changes, so there is no re-sort, no texture
    rewrite and no per-frame CPU work at all.
  - **The fragment branch is on the `u_egg` UNIFORM, never on `vPhase`.** `fwidth()` is undefined in
    non-uniform control flow and a per-splat varying is exactly that, so the hard-edge term cannot be
    computed under `if(vPhase>0.0)`. Same hard-edge form as the SMV viewer's ellipsoid control;
    `vPhase` is `flat` on both sides and nothing here checks that they stay in step.
  - **The squeeze is `maj`/`mn` scaled in the vertex shader**, which is the radius: the quad spans
    ±2 std-devs, so scaling the quad scales the footprint. It squeezes past the screen-space
    low-pass too, which is what makes the splats separate instead of merely hardening.
  - **The wave is seeded on the PICTURE PLANE, not in screen space** — the press point is
    unprojected onto `planeN`/`planeP`, which `frameScene()` stores from the same principal axis the
    opening view is derived from. The ray is built from `camBasis()` rather than by inverting the
    projection, because this renderer's `u` points *down* the screen and the two have to agree.
    **Checked**: round-tripped against the renderer's own projection over 2000 random poses, tilted
    planes and non-square canvases — worst error 1.6e-14 world units. Re-check it the same way if it
    is touched; a sign error seeds a mirrored point and still looks like a wave.
  - **Movement cancels the ARMING only.** The threshold is measured from where the press started,
    not per event (jitter accumulates, and a per-event test lets a slow drag through), and once the
    egg has fired dragging turns the dissolved cloud like anything else — which is half the point of
    it. A second finger disarms the wait but is left alone after it has fired, so you can pinch in.
  - **Under `prefers-reduced-motion` the front is widened to the whole cloud**, so the change
    arrives everywhere at once: the same reveal without a wave travelling across the page. The
    duration is unchanged either way, since the speed is derived from the distance to be covered.
  - **The four `-webkit-touch-callout`/`user-select`/`tap-highlight` declarations on `#gl` are part
    of the feature.** A two-second press is also what a touch OS reads as *select this*, and it
    raised iOS's callout and magnifier over the painting; `preventDefault()` on `pointerdown` does
    not stop it. Android's long-press menu is refused by the `contextmenu` handler that was already
    there for right-drag. Same lesson, same four declarations, as the SMV viewer's movement pad.
  - Holding **space** does the same thing from the keyboard, seeded at the centre of what is on
    screen since there is no press point to unproject.
  - **The shaders are NOT glslangValidator-checked** — there was no network on the box, as with
    `knots.html`. A compile error here throws at module top level and leaves the page sitting on
    *Loading the painting…* for ever, so run the validator over both if you touch them.
- **The swap is three phases, not one animation, because the wait is a real download.** Changing
  works fetches and decodes 0.8–2.4 MB, so a single timed transition would either end on an empty
  wall or sit there after the work was ready. `loadScene()` is: a **fixed exit** (`SWAP_MS`, paired
  with the `.swap` transition in the CSS — change one, change the other), an **indeterminate hold**
  during which the status line narrates the download, and an **entrance fired by the load finishing**.
  Only `opacity`/`transform` are animated, both compositor-only, so the transition costs the
  renderer nothing. Four things fall out of it and are load-bearing:
  - **The camera cut happens at zero opacity.** `frameScene()` re-frames on the new work's own
    principal axes, which is a hard jump; it is invisible because it runs while the canvas is
    faded out. Never move it after the fade-in.
  - **`swapGen` guards every await.** Clicking the other work mid-load must not let the abandoned
    one write into the page. A superseded fetch is left to drain rather than aborted (aborting
    mid-stream poisons the HTTP cache for the reload that usually follows) but stops narrating —
    hence `fetchBuf(url, gen)`.
  - **A failed swap leaves the previous work hanging.** The old cloud is still resident, so the
    catch removes `.swap` and shows the message over it, rather than emptying the wall.
  - **`eggReset()` runs at the swap, not `eggRelease()`.** `eggTravel`/`eggW` were measured on the
    old cloud; letting the wave retreat across the new one would animate a front sized for a
    picture that is no longer there.
- **The easter egg is deliberately NOT the swap transition.** Dissolving the old work into its
  gaussians and assembling the new one out of them is the obvious and prettiest thing to do here,
  and it would spend the egg: a discovery that fires on every click stops being one. If that trade
  is ever judged worth it, the swap is the only place to change — hold the dispersed state through
  the load instead of fading, i.e. `eggFire()` on exit and let the return pass play on entry.
- **Keep it a card, not a paper.** The page had a paragraph under the picture stating the capture
  and compression numbers; it was deleted on purpose — this is a shelf item, and a methods note
  turns it into a project page. So the numbers live in this file, and the page carries only the
  wall label, the hints and the credits. Do not put a technical paragraph back.
- **Deliberately not ported from the demo:** the dark viewport, the loader ring and timer, the
  fullscreen button, the fps line, and the render-settings bar (specular SH degree, hard ellipsoids,
  radius). SH is simply always full `l3` — `u_shBands` and the hard-ellipsoid branch are gone from
  the shaders rather than left unreachable. This page is a wall, not an instrument.
- **The wall label comes from the catalogue records, not from the plaque.** It was first transcribed
  off the gallery plaque visible in the capture frames, and that version was wrong in the ways a
  half-legible photograph will be: the German title as the primary one, no date, no dimensions, no
  inventory number and the foundation mistaken for the owning institution. It is now
  Bernardo Bellotto (1721 Venice – 1780 Warsaw), *Rovine della Kreuzkirche di Dresda* / *The Ruins
  of the Kreuzkirche in Dresden*, 1765, oil on canvas, 84.5 × 107.3 cm, **Kunsthaus Zürich, The
  Betty and David Koetser Foundation, 1994, Inv. KS 70** — reconciled against the two records the
  page links under the label ([collection.kunsthaus.ch item 471](https://collection.kunsthaus.ch/en/collection/item/471/)
  and Google Arts & Culture). Edit that text from the record, never from the capture frames. The
  two links under the label are titled by their **source** (*Kunsthaus Zürich*, *Google Arts &
  Culture*) rather than by what they are, so the label cites where its data came from.
  As a sanity check the reconstruction agrees with the record: the cloud's in-plane extents are
  1.261:1 against the catalogue canvas's 107.3 : 84.5 = 1.270:1, the small shortfall being the
  ornate frame, which is included in the cloud and slightly squarer than the canvas.
  The painting is long out of copyright;
  the footer's reserved-rights line covers the capture, the code and the text, and the *Built with*
  block (fflate, antimatter15's `splat`, EWA splatting, 3DGS) is load-bearing beside it.

Re-stage a scene with the demo's builder, then copy it in — there is no `scenes.json` here, the page
names its scenes in the `SCENES` table:

```bash
# NAME=PATH pins the staged folder name, which matters when re-staging a work from a differently
# named bundle: kunst_02 is on its SECOND prune (bundle_pruned_02_packed, floaters off the picture
# plane removed), and without the prefix the builder would slug a new folder from the bundle dir.
conda run -n 4dre python ~/4d-relight/web/demo/build_demo.py \
  --bundle kunst_02=/cluster/scratch/misong/4dre/static/kunst_02/bundle_pruned_02_packed
# then copy web/demo/scenes/<name>/ -> misc/museum/scenes/<name>/ and add a SCENES entry
```

**Re-pruning a work means re-checking its framing**, since the opening view is derived from the
0.5/99.5-percentile extents and pruning moves them. For this re-prune the fit came out at 4.95
against the previous 4.96 (half-extents 2.890 × 1.464, was 2.898 × 1.547), i.e. no visible change —
but a heavier prune could shift it enough to be worth a look.

**A new work must be checked against the two sign conventions before it is hung**, since the opening
view is derived rather than embedded: world up is `-y`, and the camera stood on the `-z` side. The
second is the one that can fail — verify it by dumping the dataset's camera centres and comparing
them with the cloud's centroid along the normal (for `kunst_02`: cameras at z ∈ [−4.4, 1.4] against
panels at z = 5.14 ✓). Get the sign wrong and the page opens on the back of the panels.

**There is no `node` on this box, so the module is syntax-checked with `esprima`** — a top-level
syntax error throws before anything renders and leaves the page on *Loading the painting…* for ever,
which no other check here would catch:

```bash
pip install --target /tmp/pylibs esprima
PYTHONPATH=/tmp/pylibs python3 - <<'PY'
import re, esprima
src = open('misc/museum/index.html', encoding='utf-8').read()
code = re.search(r'<script type="module">(.*?)</script>', src, re.S).group(1)
esprima.parseModule(code); print('module ok')
PY
```

Do **not** pass `--scene_config`: embedding a held-out camera would override nothing (the page
ignores `scene.camera`) but it would suggest the framing comes from the dataset when it does not.
`reference.npz` is Git LFS, per the repo-wide `*.npz` rule.

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
3. **1×1, the fitted spline itself — with a picker for TWO examples that are DIFFERENT RENDERERS.**
   Not a comparison: one at a time, showing that "the timeline is continuous because the spline is
   evaluated, not replayed" is a property of the *field*, not of any one pipeline.
   - **DeformingThings4D *astra / samba dancing*** (`points.html`, `kind:'points'`) — the GS-free
     path: the field fitted straight to a mesh's vertices, no rasteriser, no decoder. 837 frames
     from 105 knots. See the `points.html` section below.
   - **D-NeRF *hook*** (`knotsplat.html`, `kind:'knot'`) — the same curve carrying a *compressed
     gaussian scene*: 100 frames of 23,716 gaussians out of **15 stored knots**, 2.3 MB.
     See the `knotsplat.html` section below.
4. **1×2, the model taken apart — with a picker for TWO trained models.** What the model *stores*
   and what it *predicts*, side by side: left, the canonical gaussians and the deformation field's
   three tri-planes in one scene (`field.html`); right, a sample of those gaussians pushed to the
   two knots bracketing the playhead, with their tangents and the arc between them (`knots.html`).
   That is what makes it the last card — the three above show what the field *does*, this one
   shows what it *is* and what it emits. **Two more renderers, one card**, and the entrance to
   `triplanes.html`, which the card links. See the `field.html` and `knots.html` sections.

   The two examples are **D-NeRF bouncingballs** (75 knots — one every 2 frames — rank 6) and
   **D-NeRF lego** (`lego_02`: 7 knots over 50 frames — one every ~8 — rank 1), chosen to be far
   apart on the one axis that decides whether the stored tangents mean anything. They are not a
   like-for-like comparison and are not presented as one: the picker shows one at a time, and the
   card's clock, camera and view options belong to whichever is loaded.

**`kind` is the only axis the host branches on.** Two of them are **host-decoded** — `'splat'`
(the first two cards, `viewer.html`) and `'knot'` (the third card's second example,
`knotsplat.html`) — because a decoder per canvas is another copy of a ~32 MB ffmpeg core; both go
through `pump()`, and `flush()` sends them a keyframe and then one payload per GOP/chunk, freed on
the panel's ACK. Two are **self-loading** — `'points'` and `'field'` — needing no decoder at all,
so `startGroup()` skips `pump()` and `flush()` sends them options and a seek rather than data.
Anything per-kind — the required view-option keys (`OPT_KEYS`), what `viewState()`
sends, which controls `pushView()` wires (`OPT_WIRING`), whether the camera flies and so wants the
pad (`PAD_KINDS`) — is a table keyed by it, not an `if`
scattered through the file. A group also opts into a **continuous clock** with `frac:true`, which
changes `setFrame()`'s label and lets `tick()` advance in fractional frames.

**`kind` is per SCENE, not per group — the trajectory card switches RENDERER with its picker.**
`g.kind` follows the selected example (`applyScene()` sets it from the table); everything that
branches reads it live. A group that can switch declares two extra fields:

- **`kinds`** — every kind its option block must wire at boot, since re-wiring on a switch is one
  more thing to forget. Overlapping keys are simply assigned the same handler twice.
- **`optKind`** — the `OPT_KEYS` entry its block satisfies, i.e. the **union** of its kinds' keys
  (`OPT_KEYS.traj`). `verify.py`'s `check_repeated_controls` matches `data-kind` against exactly
  one entry, so the union has to be a named entry rather than something inferred — which is what
  makes "added a control to `knot` and forgot the block" a check failure rather than a dead card.

The controls belonging to the *other* example carry **`data-only="<kind>"`** and are hidden by
`applyScene()`, which sweeps the whole card (`ui.root`) so a per-example control can sit in the
transport as well as in the options block — the touch pad does. **That needs the CSS rule
`[data-only][hidden]{display:none}`**: `.vrow` and `.tchk` both set `display`, and an author class
selector outranks the UA stylesheet's `[hidden]`, so the attribute alone leaves the row on screen
with only the script believing it is gone. (`.tbtn` sets no `display`, which is why the Load/Clear
buttons' `hidden` has always worked.) The sibling rule beside it drops the separator a hidden row
would otherwise leave above the visible one.

**`kind` is not per PANEL, and the last card has two different renderers in one group.**
That is deliberate and it is why nothing had to be re-keyed: `VIEW.field` emits *both* panels' option
sets in one message and each panel reads the keys it knows (`sheets`/`cast`/… in `field.html`,
`knSamples`/`knScale`/… in `knots.html`), which is exactly the idempotence the protocol already
required. A new panel of a new kind inside an existing card needs an `OPT_KEYS` extension and more
keys in that kind's `viewState()`, not a second group — a second group would mean a second clock and
a second camera for one comparison. Two knock-ons: `status()` **joins** every panel's `note` rather
than taking the first (each renderer is the only thing that can describe what it built), and a
slider whose range depends on the data is clamped from the panel that owns it (`castMax` from
`field.html`, `sampleMax` from `knots.html`).

Optional transport controls are **simply absent from that card's `ui`, resolved to `null`, and
guarded at every use**: `touch` (only the cards whose camera *flies*), `prev`/`next` and
`speed` (only the trajectory card has marked-instant steppers and a playback rate). Adding a
control to one kind must not force a dummy into the others. `g.el` is built by walking `g.ui`
rather than by naming keys, and `verify.py` reads the same `ui:{…}` blocks for its id check — so
a new control needs no edit in either place.

**The steppers and the frame readout are driven by `marks`, not by "supervised frames".** A panel
sends `marks` (a list of frame positions), `markOn` and `markOff` (what to call being on one and
between them) with its `ready`, because what is marked depends on what shipped: `points.html`
sends the frames the field was trained on ("supervised" / "inferred"), `knotsplat.html` sends
where its 15 knots fall ("at a knot" / "between knots"). **Marks are floats and are matched
exactly** — 15 knots over 100 frames is one every ~7.07, so the old integer `Set` could not have
held them. The list is scanned linearly per label update; the longest here is 210 entries.

**`ready` can arrive more than once from one panel**, and the host's opening seek fires on the
first only. `knotsplat.html` reports at keyframe install and again when its knots land, because
the parity margin in its `note` does not exist until then; without the `first` guard the second
report would yank the playhead back to frame 0 under a visitor who scrubbed during the decode.

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
one wasm heap and race `disposeFFmpeg()` against a live decode. `verify.py` reads
`data-src` for asset checking; without that it stopped seeing `viewer.html` entirely.

**The decoder is kept while any loaded card still wants it, and that is deliberate.** It used to be
disposed the moment the queue drained, which was wrong once three of the four cards decode:
`disposeFFmpeg()` also **revokes the blob URLs the core was compiled from**, so loading a second
decoding card re-fetched and re-compiled the whole 31 MB. This page cannot lean on the service
worker to soften that either (`sw.js` is registered under `/projects/smv/` and its scope does not
reach here, so the refetch falls back to the plain HTTP cache, or the network if that has evicted
it). `decoderWanted()` is the rule now: any **started** group whose `kind` is in `DECODER_KINDS`
holds the core; clearing the last of them releases it, so the memory still comes back on request.

Two call sites, and the split matters. `releaseDecoder()` runs at pump()'s drain, where the queue
is empty and nothing is mid-decode. `releaseDecoderSoon()` runs from `clearGroup()` and is
**deferred by a tick**, because the example picker clears and restarts a card in one synchronous
go: releasing on the spot would race `disposeFFmpeg()` against the `ffmpegReady()` of the load
starting immediately after. Never call `disposeFFmpeg()` straight from `clearGroup()`.

**Both release with `{keepCore:true}`, and that is what makes Clear-then-load cheap.**
`disposeFFmpeg()` frees two things with very different reacquisition costs: the **instances** (the
primary, the helper pool, the dequant worker — each holding a live wasm heap that *grows* with what
it has decoded, so this is the large and unbounded part, rebuilt in milliseconds) and the **core
blob URLs** (the fetched ~32 MB of `ffmpeg-core.js`/`.wasm`, fixed size, and reacquiring them means
fetching 32 MB again). Revoking the blobs is exactly what made pressing Clear and loading again
re-download the core. `keepCore` frees only the instances, so the working set genuinely goes back
while a reload costs a wasm compile; the blobs go when the page does. Default is still the full
release, so `viewer.html`'s standalone fallback (done for good after one decode) is unaffected.
`coreCached()` exists so the status line only promises "~31 MB, one-time" when a download is
actually about to happen, and says "starting the decoder" otherwise.

`disposeFFmpeg()` / `coreCached()` are **site-only additions to `decode_motion.js`** — upstream's
copy has neither, and this file already diverges from it in `coreURLs()` too (see the module-relative
note below). The "edit upstream and sync" rule covers the decode *math*, not this lifecycle helper.

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

**Navigating a long page: the contents list and the back-to-top control.** Four cards, each a few
screens tall once loaded, so the page is long before anything is even running.

- **`nav.toc`** sits under the *Playground* heading and links `#abCard` / `#amCard` / `#ptCard` /
  `#fdCard`. Its link text is the card's `<h3>` **verbatim** so the link and its destination cannot
  drift apart (and a screen reader announces the heading you are about to land on); a card renamed
  without its entry is the one thing to watch, since nothing checks it. Same pill as the header's
  `.back` button, so the two read as one family rather than two inventions, and it wraps rather
  than scrolls horizontally, which would hide exactly the entry someone is hunting for. The card
  ids reuse the `ab`/`am`/`pt`/`fd` prefixes the transports already use. `#ptCard` predates this:
  it is also the trajectory group's `ui.root`, which `applyScene()` sweeps for `data-only`.
- **`.totop`** is revealed only once the masthead has scrolled away, by an **IntersectionObserver
  on `#top` in a CLASSIC script** at the foot of the body. Classic for the same reason the boot
  watchdog is: navigation must not be what breaks when a decode-path fetch is dropped and the
  module never evaluates, and a scroll affordance has no business waiting on a ~32 MB decoder
  graph. An observer rather than a scroll handler so nothing runs per scroll event over a page
  with four WebGL panels; where the API is missing the control is simply always shown, which is
  the right way to fail for something whose job is to be reachable. Hidden state is
  `visibility:hidden`, not just `opacity:0`, so it leaves the tab order while invisible.
- One known overlap, judged acceptable: the control is fixed bottom-right, and so are the virtual
  pad's up/down buttons *inside* a panel. It only bites on touch, on the americano card (the only
  one that still flies), with the pad on, and with that panel at the viewport's bottom-right. On a
  phone the grid is one column and the pad is on the FIRST panel, i.e. the topmost, so in practice
  they do not meet. Move the control before adding a pad to another card.
- `scroll-behavior:smooth` and `.subcard{scroll-margin-top}` make a jump land the card's top edge
  just below the viewport edge instead of flush against it. Both are switched off in the
  reduced-motion block, along with the two new transitions.

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

**The tri-plane card's example picker: `FIELD_SCENES`, and why the table rather than the markup.**
Both panels of that card are one example, so the picker (`#fdScene`, resolved through the group's
`ui` like every other control) swaps both `src`s at once and restarts the card if it was already
showing something — leaving the old model on screen under a new label would be worse than the
reload. `applyScene()` also rewrites the three pieces of prose that quote per-model numbers (the
subtag, the Load button's size, and the lede's "plus six more, scaled by six numbers", which is a
`<span>` because lego is rank 1) — **nothing checks those against the bundles**, so they live in the
table beside the URLs rather than scattered through the markup. The markup's `data-src` still
carries the default example so `verify.py` sees a real URL; the table wins at init, and if the two
ever disagree the table is what loads.

Two things a second example exposed, both fixed rather than worked around:

- **`ready`-time slider clamps must not ratchet.** `castMax` / `sampleMax` narrow a slider to what
  the loaded scene can actually supply, and they only ever *lower* the max — so switching from a
  scene with few castable gaussians to one with many would have left the slider stuck low. `g.oMax`
  remembers the markup's ceiling and every clamp starts from it.
- **The tangent scale is reset on an example switch**, the one exception to this page's rule that a
  view option keeps its value across a load. It is a calibration, not a preference: the two models'
  tangents differ by ~10× in magnitude, so bouncingballs' ×120 draws lego's arrows several screens
  long. Per-example defaults are `scale:` in the table.

`triplanes.html` is **deliberately left on bouncingballs** and is not switched by the picker: it has
no `?tri=` parameter, its rank selector is six hardcoded `<option>`s, and its prose counts "six
weights at 75 knots" throughout. Making it follow the picker means data-driving all three — worth
doing if a third example ever lands, but it is a page-sized edit, not a parameter.

**The `cam` relay carries two flavours and the host does not care which.** A fly camera
(`viewer.html`) sends `{pos,quat,speed}`; an orbit camera (`field.html`, `knots.html`) sends
`{orbit:{yaw,pitch,dist,target}}`, because a shared eye is *not* enough to keep two turntables in
step — the target and the distance are what the pointer handlers actually edit, and two panels that
agreed only on the eye would drift apart the moment either panned. The host stores whichever arrived
in `g.lastCam` and re-sends it to a panel that announces late (`flush()` sends it on the
points/field path too, not just the keyframe path). Both orbit panels guard the echo the same way:
`pushCam()` posts only on an actual change and `applyCam()` records what it adopted, and an adopted
pose sets `adopted` so the loser of the load race does not yank the pair back to the opening pose
when its own `frameScene()` runs. `home` is still the opening pose, so *reset view* is unaffected.

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
- **Navigation is per panel: `viewer.html` takes `?nav=orbit`, and only the americano card still
  flies.** The choice is a property of the *capture*, not of the renderer, which is why both modes
  live in that file rather than one replacing the other. **Orbit** (bouncingballs' two panels, and
  `knotsplat.html`, which has no fly path at all) is the vocabulary `points.html` / `field.html` /
  `knots.html` already use: a synthetic D-NeRF subject sits at the origin, so rotating and dollying
  *it* is what a reader wants, and one finger / two fingers reach all of it. **Fly** stays the
  default and stays on americano: a close hand-held HyperNeRF capture of a table top, whose world
  frame is not Z-up (the orbit path hardcodes `UP=[0,0,1]`) and which deliberately renders past the
  filmed frustum, so "look around from in here" is the useful verb. Three things follow:
  - **A group must be all one mode.** The `cam` relay carries either flavour and the host does not
    care, but an orbit state cannot be applied to a fly camera — so `?nav=` is set the same way on
    every panel of a card.
  - **Orbiting, `resetView` restores `home` directly**, not through `frameScene()`: that function
    deliberately declines to overwrite a pose adopted from the panel beside it, which is right on
    load and wrong for a button whose entire job is to undo where you have got to.
  - **An orbit card has no pad and omits `touch` from its `ui`** (see below). `setTouchUI()` also
    refuses in orbit mode, so a standalone `?touch=1` or a stale host message cannot raise one.
- **The virtual movement pad follows the CAMERA, not the kind.** It drives the WASD axes, so it
  exists only for a card whose panels fly — **americano alone today**. `pushTouch()` no-ops when a
  card has no `touch` id, which is what lets every caller stay unconditional. Do not reintroduce a
  kind-keyed rule: bouncingballs and the knot example are both splat-drawing cards that orbit.
- **The pad is per group, but only ever on ONE panel of it.** Same control as the
  SMV viewer's (`#vctrl` / `#joy` / `#vbtns`, stick → the WASD axes, ▲▼ → the Q/E axis, folded into
  `moveCam()`), but retinted: the SMV pad is translucent white over a dark scene, which on this
  page's white panel is invisible. The pad has to live *in* the panel — it sits over that canvas and
  drives that renderer's camera — but **ownership is a host decision**, sent as `{type:'touch',on}`
  to every panel in the group, `on:false` included. The cameras in a group are linked, so a pad per
  panel would be N controls for one camera, each covering a third of the comparison. `touchPane()`
  picks the first *live and announced* panel — leftmost in the 1×N grid, topmost once it collapses
  to one column — and `pushTouch()` re-pushes on every hello (via `flush`), every panel failure and
  every toggle, so ownership can move without leaving a stale pad behind. The per-group checkbox
  (`amTouch`, in the transport, id-addressed since it is not part of the repeated
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

The fourth card's LEFT panel (`knots.html` is the right one): both halves of the model in the
coordinates they are stored in. The
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
- **Hard ellipsoids are the CLOUD ONLY, and that is why the flag is a varying.** Same control, same
  units and the same shader branch as the two comparison cards (`ellip` / `ellipR`, radius in
  std-devs), but here one draw call holds both kinds of splat, so the fragment shader is told which
  it is by a `flat out float vHard` rather than by a global uniform. Hard-edging the sheet cells
  would turn a continuous feature image into a grid of discs with gaps between them — the cells are
  gaussians for occlusion, not because they are meant to read as points.
- **`cast` draws the lookup itself.** One segment per sampled canonical gaussian per plane, from its
  centre to the foot of its perpendicular on that face: that foot is the address the field is read
  at, and the sheet's colour there is the value it gets back — which is the one thing the sheets
  alone cannot show. Details that are load-bearing:
  - Gaussians **outside the field's AABB are skipped, not clamped** (there is no foot on the sheet
    to draw, and a clamped one would depict a lookup that never happens), as are near-transparent
    floaters. That leaves fewer than the slider's nominal 3000, so the panel reports `castMax` on
    `ready` and the host **clamps the slider to it** — a silent no-op at the top of a range is worse
    than a shorter range.
  - The buffer is built **once**, in a deterministic (fixed-seed LCG) shuffled order, and the count
    slider draws a **prefix**. The shuffle is what makes a prefix an even sample of the cloud rather
    than whatever order the exporter wrote; without it the slider would have to rebuild.
  - Lines are gated on `u_show` **in the shader**, so hiding a sheet hides its lines with no second
    control, and they are drawn **after** the splats with the ordinary `SRC_ALPHA` blend, handing
    the front-to-back `under` operator back afterwards — the same two-line dance `drawTraj()` does
    in `viewer.html`. Alpha ramps from 0.18 at the cloud end to 1.0 at the plane end: the cloud end
    is the crowded one, the plane end is the one carrying the answer.
- **A line program is back, and only for the above.** The old one drew a bounding-box wireframe to
  prove the sheets sit on the field's own AABB; that is settled (and checked offline), and on a
  teaching figure the box read as scene geometry. **Do not re-add the wireframe** — but the cast
  lines are a different claim, not the same feature returning.
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

**Shaders are checked, not hoped for.** `glslangValidator` from the Khronos release compiles all
four — the splat pair and the cast-line pair — (`#version 300 es`) clean, and a deliberate typo was
confirmed to fail; `-l` links each pair, though note it does *not* catch an interpolation-qualifier
mismatch across stages, so `flat` on `vHard` has to be kept in step by hand. A shader error blanks
the panel and nothing else on this site would catch it. The atlas→texture layout and the shader's
`texelFetch` indexing were separately checked against the checkpoint (≤2 % of display range, i.e.
quantisation only). Do the same after touching either.

### `knots.html` — the pushed knots and their tangents (a FOURTH renderer)

The fourth card's right-hand panel, and the teaser figure animated: for a sample of the canonical
gaussians it draws `X^c` (red), where the field puts it at the knot **left** of the playhead (blue)
and at the knot **right** of it (green), each knot's tangent, the cubic Hermite arc between them,
and the point itself at `t` on that arc. Beside `field.html` — the storage — this is the output.

It is a **fourth renderer** and a deliberately small one: points and lines, no splats, no depth
sort, no SH, no decoder. It shares the `{ch:'spdef'}` protocol, the orbit camera and the standalone
fallback clock with its neighbours **and nothing else**; the splat core would have been carried
whole to draw 1-pixel segments.

What is load-bearing:

- **The interval is TINY, and the figure is built around that.** Consecutive knots are two frames
  apart: the mean chord between them is 0.007 in a scene 2.6 across — a couple of pixels. Drawn
  alone the two knot dots sit on top of each other, which is why the **whole trajectory (all 75
  knots) is drawn faintly as context and is ON by default**: one interval is 1/74 of it, and
  without something to be small against, "which interval am I in" is unreadable. Zooming resolves
  the rest.
- **Tangents are drawn SCALED and the HUD names the factor.** The trained tangent is the derivative
  per *interval*, and this field's are ~0.0007 against a 0.007 chord, so true scale is sub-pixel.
  The default is ×120. Scaling is the only way to show direction; hiding the multiplier would
  misstate the magnitude, hence the readout — do not drop it from the HUD.
- **THE TWO EXAMPLES ARE THE EXPERIMENT, and this is the number to look at.** Knot density decides
  whether the stored tangents mean anything, and the card's picker puts the two ends of that beside
  each other. Measured on the shipped bundles:

  | | knots | per interval | `\|v\|/\|chord\|` | angle(v, chord) | tangent term | speed at knot / mid |
  | --- | --- | --- | --- | --- | --- | --- |
  | bouncingballs | 75 | ~2 frames | 0.105 | 63° (28 % < 30°) | 1 % of the chord | 0.11× / 1.49× |
  | lego (`lego_02`) | 7 | ~8 frames | **1.088** | **8° (98 % < 30°)** | 13 % of the chord | 1.09× / 0.99× |

  At 8-frame intervals the tangents come out *tangent to the path*, at the magnitude a faithful C¹
  interpolant wants (Catmull-Rom would say 1.0), and the rendered motion runs at near-constant speed
  through the knots (1.09× / 0.99×) instead of the smoothstep stop-and-rush the dense run shows
  (0.11× / 1.49×). That is the identifiability argument confirmed from the other side: give the
  tangent term something to explain — 13 % of the chord rather than 1 % — and the loss constrains
  it. **Do not "fix" the bouncingballs arrows.** If a run's arrows look wrong, measure these numbers
  before touching anything.

- **The grey arrow is the SECANT, and it exists because the trained tangents do not follow the
  path.** Measured on the shipped bundle: `|v|` is **0.10** of the interval's chord and **64°** away
  from it (28 % within 30°), and the tangent field is nearly spatially constant (`|mean unit vector|`
  = **0.85** — every arrow parallel). That is the model, not the drawing: finite-differencing the
  rendered arc at the knot reproduces the drawn vector to 9e-5, and the parity block ties the curve
  to torch. The cause is identifiability — with `spline_interval_stride = 2` a knot lands every two
  frames and the piecewise-linear part already explains the motion: the tangent term moves the
  rendered curve by **~1 %** of the chord (median 0.010 of it, p90 0.069), which at this scene's
  0.007 chord is *below the position quantisation step the shipped bundle uses*. The reconstruction
  loss therefore has almost nothing to say about `v`, and `xyz_velocity_div_loss = 5000`, which
  penalises velocity *differences between neighbours*, decides — minimised by one spatially constant
  field of any magnitude, which is exactly the 0.85. The `bouncingballs_wo_reg` run is the control:
  same measurement gives 2.79 and 86°, long and random.
- **What tangents that small cost, and why it still renders fine.** The arc's departure from the
  straight chord is `t(2t−1)(t−1)·(m̄ − secant) + t(1−t)·(m₀ − m₁)` — it is straight exactly when the
  tangents equal the secant. Measured: 9.5 % of the chord against a pure `m = 0` (smoothstep)
  reference of 9.62 %, i.e. **the trained motion is smoothstep between knots** — 0.105× the mean
  speed at each knot, 1.49× mid-interval, a **14× speed swing every two frames**. Sub-pixel in
  position at this knot spacing; it scales with the chord, so it is the thing to look at on a
  sparse-knot run.
- **The SECANT was drawn beside the tangents and then REMOVED — do not re-add it.** It made the
  disagreement visible (that was the first thing a reader asked about), but a quantity computed in
  the panel, sitting next to one the model stores, reads as though the model produced both. The
  figure shows stored vectors only; the disagreement is documented in prose instead — this section,
  the panel header and the control's tooltip.
- **Only moving gaussians are in the bundle.** The field pushes *every* gaussian off its canonical
  position (the canonical frame is not the t=0 pose), so `|d_xyz|` says nothing about motion; the
  exporter selects on peak deviation from the point's **own time-mean** (> 0.02 → 6,181 of 14,534).
  For the static half the two knot dots would coincide with zero-length tangents.
- **A prefix is a sample.** Rows are written in a deterministic shuffled order, so the count slider
  draws the first N and still gets an even sample — the same trick `field.html`'s cast lines use,
  and the reason moving that slider rebuilds nothing but the geometry.
- **No depth test, painter's order instead** (unlike `points.html`). There is no solid geometry to
  occlude anything and one sample's three dots sit within a pixel of each other, so a depth test
  would arbitrarily pick which survives. Order is context → interval → dots → the point at `t`.
  That last one is a **ring**, not a disc (`u_mode` 2 vs 1), so it surrounds the two knot dots
  instead of covering the thing the card exists to show.
- **Parity is checked on load.** `meta.json` carries torch-computed positions at 8 points × 6 times
  and a tolerance; a mismatch refuses to draw. Same contract `traj.js` has with `traj_codec.py`,
  for the same reason — a curve that is subtly wrong still looks like a curve.
- **The camera is linked**, so the projection is `field.html`'s *verbatim* (same eye formula, same
  screen-down `u`, same Y-flipped matrix, same `elev`/`zoom` defaults). If the two disagreed, one
  orbit state would frame two different views. See the `cam` relay note above.
- Buffers are **pooled, not reallocated**: the interval geometry is rebuilt every time the playhead
  crosses a knot — about every other frame at 30 fps — and at the top of the sample slider that is
  ~3.5 MB of garbage per rebuild otherwise. The whole-path buffer is time-independent and rebuilt
  only when the count or its toggle changes.

The bundle is `projects/spdef/knots/bouncingballs/` — `meta.json` + a single 1.37 MB `knots.bin`
(canonical f32, then `d_xyz` and `v_xyz` as int16 on a per-component (zero, scale) grid; **not**
float16, because the tangents are ~5e-4 and their *absolute* resolution is what the figure needs).
One file, not the points bundle's streamed-per-knot layout: at this size streaming would be
machinery for nothing. It is a **plain git object, not LFS** — same reasoning as
`projects/spdef/points/**/*.bin`. `verify.py` now follows any referenced `meta.json` to the `bin`
it names, since no page mentions that file and a manifest committed without its payload would fail
only in the browser.

**Shaders here are NOT glslangValidator-checked** — unlike `field.html`'s four, which are. There
was no network on the box they were written on; they are two short ones (a pass-through vertex
shader with `gl_PointSize`, and a fragment shader whose only branch is the point-sprite mask) and
the panel reports a compile failure through its own error path rather than blanking. Run the
validator over them if you touch them.

### `knotsplat.html` — a compressed scene played from its knots (a FIFTH renderer)

The trajectory card's second example. A **knot bundle**
(`scripts/compress/compress_knot_bundle.py`) stores the deformation field's own knots — a value
and a tangent per knot — instead of one delta image per frame, so any timestep is a cubic-Hermite
blend of the two knots bracketing it. For *hook*: **15 knot images per stream instead of 99 delta
frames**, and 100 frames of 23,716 gaussians come out of 2.3 MB.

It is a fifth renderer, not a mode of `viewer.html`, for the reason upstream split
`web/player_knots/` off from `player_browser`: the two formats disagree on everything below the
keyframe — four streams per chunk instead of two, one image per *knot* instead of per frame, a
blend of two knots instead of keyframe-plus-delta, and no streaming window because the whole knot
set is resident. `viewer.html` is what the two published comparisons depend on and its decode path
is the one this file pins to `compression/decoder.py`; branching it for a second format is exactly
the risk that rule exists to prevent. The renderer core (shaders, `RGBA32UI` splat texture,
full-range 16-bit bucket sort) is `viewer.html`'s verbatim; the **orbit camera is `field.html`'s**,
which shares the same basis convention — see *Navigation* below.

- **Trails are the MESH card's, not `viewer.html`'s, and the Trails control is shared between the
  two examples.** Each sampled gaussian's path is evaluated from the spline over the preceding
  frames and the segment colour flips at every knot, so one stripe is one interval (about 7 frames
  on hook, about 8 on astra). That is the whole reason the figure is worth drawing on a gaussian
  scene at all: the colour change *is* the knot, which is the spacing the paper argues about.
  `viewer.html`'s overlay is a different thing (a stored per-frame array, faded blue to red by age)
  and would say nothing about knot spacing. Details that carry over from `points.html` unchanged:
  the two stripe colours, alpha 0.65 further multiplied by `vAge`, the exact knot times inserted
  into the uniform sample set so a stripe boundary lands **on** a knot, and per-interval runs drawn
  as one `drawArrays` each. `evalSubset()` is `blendKnots` restricted to an index list, built from
  the module's own `curveBasis`/`curveOrder` so there is still one definition of the curve; the
  full-cloud path would evaluate all 23,716 rows per sample, which at ~200 samples a frame is not
  affordable. **`TRAIL_POINTS`/`DETAIL` are 900/4, below points.html's 1500/5** — that card draws a
  mesh and nothing else, while every frame here already costs a full-cloud blend, a splat-texture
  upload and a depth sort, and the trail is rebuilt on top of that. **No motion filter is needed**
  (unlike the bundle behind `knots.html`): every gaussian in hook moves, median peak deviation from
  its own time-mean 0.216 in a scene 2.5 across, so a stride over the PLAS-sorted rows is already an
  even sample. A trail crossing a CHUNK boundary is reported as absent rather than drawn: each chunk
  has its own reference and its own PLAS order, so row *j* is a different gaussian either side.
- **What it deliberately does NOT carry**, unlike `viewer.html`: the colorize-motion tint, which
  reads a per-frame motion array that this format has none of.
  Hard ellipsoids *is* shared: it is a property of the splat, not of how the splat got there.
- **Per frame it is two 4-term blends per gaussian**, then the ordinary splat write and sort. No
  decode, no new upload of offsets. That is why the timeline is genuinely continuous and why the
  card's Speed slider means something here.
- **The reference is the chunk's FIRST KNOT, and `xyz_d` is relative to it — but `rot_d` is
  not.** Position adds the blend to the reference; rotation adds it to the *canonical* quaternion
  and re-normalises. `compress_knot_bundle.py`'s docstring explains why the two references differ
  in kind (the position bases sum to 1, so folding `d0` into the reference cancels; doing the same
  for rotation would need a non-unit quaternion the reference grid cannot represent). Do not
  "symmetrise" this.
- **Parity is checked on load and reported in the status line.** At a knot the basis is
  `[1,0,0,0]`, so the curve must return that knot's own stored offset; a mismatch means the panel
  is rendering a deformation the model never predicted, which still looks like motion. Same
  contract `traj.js` and `knots.html` have with their bundles.
- **`knot_decode.js` is a COPY of `4d-relight/web/player_knots/knot_decode.js`** — re-copy it
  whole rather than editing here, exactly as `traj.js` is re-copied; upstream's
  `tests/test_knot_parity.py` is what ties its dequantisation and its curve to
  `compression/offset_stream.py`. The one deliberate change is the three vendor specifiers
  (`../player_browser/vendor/` → `../smv/vendor/`), which only its own `ffmpegReady()` reaches.
  **The host never calls that** — `decodeKnotChunk()` takes the ffmpeg instance as an argument, so
  the page keeps using the single instance `decode_motion.js` owns and there is never a second
  ~32 MB core. Only the standalone `knotsplat.html?scene=…` fallback instantiates one.
- **The host decodes, the panel renders** — same division as the splat cards, and it inherits
  their hardening: `grab()`'s idle timeout and cache-busted retries, `withTimeout` around the
  decoder, and a `gen` check after every await. `loadKnotGroup()` is a separate pass rather than a
  branch inside `loadGroup()` because the manifest shapes genuinely differ (`chunks[]` with
  `reference` and four streams, against `gops[]` with `reference_path` and two).

**Only the upper byte of the position streams ships**, and that is a packaging decision, not an
approximation invented in the viewer. A 16-bit stream is two planes (`xyz_*_u.mkv` +
`xyz_*_l.mkv`); the lower planes are the bulk of the download and the least compressible part of
it. `build_knot_web_bundle.py` copies only the upper plane and relabels the stream
`png16_video` → `png16_upper_video` — a format `compression/offset_stream.py` already writes and
reads, and what `compress_knot_bundle.py --no_full_precision` would have produced. Both readers
reconstruct the identical value, `(u << 8)` rather than `(u << 8) | l`, a truncation toward the
stream's minimum. `knot_decode.js` keys the low plane off the format string, so it needs no
branch. **Verified offline**: the shipped files, read through the JS formulas, match
`Png16UpperVideoReader` / `H2654ChReader` to 0.0, and the curve reproduces every knot exactly.
Cost: max position error 4.8e-06 → **2.9e-03** world units in a scene 2.5 across, for 2.3 MB
instead of 4.6 MB. Pass `--full_precision` to keep both planes.

The upstream page has a live 16-bit/8-bit A/B toggle. **There is deliberately no such control
here** — the low planes are not in the bundle, so the toggle would have nothing to switch back to.

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
  `· supervised` / `· inferred`, and why ⇤/⇥ step trained frames — scrubbing lands on one only by
  accident. Those go out on `ready` as **`marks` / `markOn` / `markOff`** (from
  `meta.train_frames`), the generic spelling the card's other example also uses for its knots; see
  the `marks` note in the host section above.
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

**`g.rate` is DERIVED from the slider, never assumed** — `applySpeed(g)`, called from init, from
the slider's `input`, and from `startGroup()`. It used to be initialised to `FPS` and only ever
updated by the handler, which left exactly one window where the control and the clock disagreed:
before the first drag. That is the common case, not a corner — a browser restores a range input's
value on reload without firing `input`, so a card reopened at 0.50× played at 1.00× until the
slider was nudged. Any new control whose state the host caches needs the same treatment; it is the
transport's version of the rule `syncViewOptions()` states for the render options.

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
knots, a 9×9 correlation kernel per channel, the measured `rho(d)` it was factored from, and a
3×3 Cholesky factor for the RGB correlation — the same quantities the paper plots. **No weights,
no architecture, and nothing from which either could be recovered.** The checkpoints themselves
are unpublishable; do not add them, and do not "upgrade" this page to run the real network (the
ONNX path in `~/tempformer/web/` exists, but shipping it here would publish the generator).

**The numbers are MEASURED FROM SIDD, not distilled from the network** (changed 2026-08-08;
`calibrate_grain.py`, which probes the ONNX generator, is still there and still works — it is
now the *other* way to fill the same file). The analyzer is
`~/tempformer/noise_synthesizer/{grain_model,measure_grain,build_grain_params}.py` with
`test_grain.py` beside it, and it stays in that repo: this one is public and the calibration
method is not something to hand out. Only the distilled values cross over.

Two consequences for the page, both visible:

- **SIDD has only 34 of the 70 (camera, ISO) combinations.** The generator could fill the rest
  because it was *conditioned* on ISO; a measurement cannot. So every entry carries `measured`,
  the ISO picker is rebuilt per camera (`syncIsoOptions()`) to label the interpolated ones, and
  `#preset-note` says which in words plus the scene count behind a real fit. The `<option>`
  **value stays the bare number** — the preset key, `readControls()` and the download filename all
  depend on it; only the label carries the marker.
- **`mix` is now the correlation BEFORE spatial filtering.** What survives to the output is
  `rho_out(c,d) = R(c,d)·⟨k_c,k_d⟩`, and ⟨k_c,k_d⟩ < 1 whenever two channels' kernels differ, so
  the measured output correlation is always an attenuated R. The analyzer divides it back out,
  then projects to the nearest correlation matrix (eigenvalue clip **and** unit-diagonal
  renormalisation — neither alone is idempotent) before factoring. On SIDD the correction is
  small (~0.01) because the three channels' kernels come out nearly identical; the acceptance
  test synthesises deliberately different ones to prove the path works.

`assets/grain-analyzer-spec.md` is the handoff note the analyzer was built from. It is **untracked
and must stay that way, or move to `~/tempformer`** — `assets/` is served, and the spec is the
calibration recipe in full, which is the thing this page deliberately does not hand out (see the
*explanation cards* note above). Committing it publishes the method. Two places the implementation
deliberately departs from it, both with a test pinning the reason:
**`fit_kernel()` refines** the spectral factorisation instead of using it once (the spec builds
the lag plane from a continuous `rho(hypot)` but measures it with `round(hypot)==d` rings, worth
~0.10 in `rho(1)`), and the **flat gate is adaptive**, set from each combination's own local-std
floor (a fixed threshold keeps 43% at G4/ISO100 and 0.2% at N6/ISO3200).

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

**Regenerating the parameters** happens in the TempFormer repo — it needs the dataset (and, for
the older path, the unpublished model) — and only the result is copied here:

```bash
# measure from the paired captures (~30 min on CPU; this is what ships)
cd ~/tempformer && conda run -n TempFormer python -m noise_synthesizer.measure_grain \
  --data_dir /cluster/scratch/misong/datasets/SIDD_Medium_Srgb/crops_256_disk \
  --max_crops 500 --out runs/grain/sidd_measured.json
conda run -n TempFormer python -m noise_synthesizer.build_grain_params \
  --measured runs/grain/sidd_measured.json \
  --out ~/mingyang-song.github.io/projects/grain/assets/grain_params.json

# the acceptance tests -- run them after ANY change to the three modules
conda run -n TempFormer python -m noise_synthesizer.test_grain

# the older path: probe the trained generator instead of the data
conda run -n TempFormer python -m noise_synthesizer.calibrate_grain \
  --samples 64 --out playground/assets/grain_params.json
```

`measure_grain.py` writes the raw per-combination fit *plus* its diagnostics (`leak_slope`,
`rho_gap_max`, `flat_threshold`, `sigma_knots_fitted`, `psd_projection_shift`);
`build_grain_params.py` is what interpolates to 70 and strips it down to what the page needs.
Read the diagnostics before shipping a re-measurement — **`leak_slope` is the one that matters**:
it is the rise in `rho(1)` from the flattest quarter of the gated pixels to the most textured, so
near zero means the fit is grain and a large positive value means it is image structure. Every
combination currently reads between −0.01 and +0.03.

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
- **`projects/spdef/points/**/*.bin` and `projects/spdef/knots/**/*.bin` are deliberately NOT in
  LFS.** LFS pays off for a few large
  files; the points bundle is 214 files averaging 23 KB (one per knot per component — see the
  build's reasoning in `web/README.md`), and 6.7 MB total. As plain git objects that costs
  nothing recurring; in LFS it would be 214 objects re-downloaded on every CI checkout, against
  a monthly bandwidth quota, for no packing benefit. The knot bundle is one 1.37 MB file, which is
  under the threshold where LFS buys anything at all. If a much larger bundle is ever
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

**Package a knot bundle for the web** (the trajectory card's second example — a *compressed*
scene whose motion on disk is the spline's knots, not one image per frame). Different builder
again, and note it writes only the **upper** position plane by default — see the `knotsplat.html`
section for why that is exactly a `--no_full_precision` bundle and not an approximation:

```bash
conda run -n 4dre python ~/4d-relight/web/player_knots/build_knot_web_bundle.py \
  --bundle /cluster/scratch/misong/4dre/dnerf/hook_mlp_06/knot_bundle_packed \
  --out ~/mingyang-song.github.io/projects/spdef/scenes/hook_knots --name hook \
  --scene_config /cluster/scratch/misong/4dre/dnerf/hook_mlp_06/scene_config.yaml \
  --source_path /cluster/scratch/misong/datasets/dnerf/hook
```

`--scene_config` + `--source_path` embed the held-out test camera (it reuses
`build_web_bundle.py`'s own `extract_camera`, so the pose convention cannot drift); without it the
panel auto-frames and opens on a pose the paper never shows. `--camera_from` copies the block out
of an existing `scene.json` instead. The bundle must be `format: knot_bundle` — a frame bundle
goes to `build_web_bundle.py`. Re-packaging changes four strings the page states as literal text,
all of them in `TRAJ_SCENES` rather than the markup: the subtag, the panel caption and its tag
line, and the Load button's size.

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

**Export the knot bundle** (the same card's right-hand panel — what the field *predicts* at each
knot, for a sample of the canonical gaussians):

```bash
cd ~/4d-relight && PYTHONPATH=. conda run -n 4dre python \
  scripts/visualization/export_knots.py \
  --model_path /cluster/scratch/misong/4dre/dnerf/bouncingballs \
  --out ~/mingyang-song.github.io/projects/spdef/knots/bouncingballs \
  --camera_from ~/mingyang-song.github.io/projects/spdef/scenes/bouncingballs_canonical/scene.json \
  --check /cluster/scratch/misong/4dre/dnerf/bouncingballs/bundle_4_packed
```

This is the **only** one of the three exporters that actually runs the field — grid lookup, feature
product, decoder MLPs, at 75 knots × 14,534 points (~25 s on a CPU). It re-implements that forward
path from the flat state dict rather than importing `GridDeformCoordNN`, because
`deformation_fields.modules.hashencoder` JIT-compiles a CUDA extension at *import*, so the real
class cannot even be loaded on a CPU box. The re-implementation is what `--check` exists to prove,
and it is a strong check: a packed bundle's `gop_k/reference.npz` is the deformed cloud at that
GOP's start frame, written by the compressor from the trained renderer — a different code path end
to end. `bundle_4_packed` is used rather than `bundle_1_packed` precisely because three of its four
GOPs start **mid-interval** (frames 38 / 76 / 113 → `t_rel` 0.87 / 0.75 / 0.12), so the Hermite arc
is exercised and not just the knot values. Current result: every sampled point matches a keyframe
point to **4.88e-4**, i.e. one position-quantisation step, at all four frames — and that also pins
the frame→time convention as `t = frame/(num_frames-1)`, which is what all four panels use.

Re-exporting changes three numbers the page states as literal text — the Load button, the subtag
(both in `FIELD_SCENES`, not the markup) and the samples slider's `max` (which the panel also clamps
at runtime via `sampleMax`, so the slider cannot outrun the data even if the table goes stale).

**Add an example to the tri-plane card** — three bundles from one trained model, then one entry in
`FIELD_SCENES`. This is the full recipe used for `lego_02`, in order:

```bash
cd ~/4d-relight
# 0. the held-out test camera. --camera_from copies one out of an existing scene.json, and a model
#    with no shipped scene has none — so build the block the same way build_web_bundle.py does.
#    (Loads camera POSES only; no image decode, no GPU.)
PYTHONPATH=web/player_browser conda run -n 4dre python -c "
import json;from build_web_bundle import extract_camera
json.dump({'camera':extract_camera('/cluster/scratch/misong/4dre/dnerf/lego_02/scene_config.yaml',
          '/cluster/scratch/misong/datasets/dnerf/lego', dataset_name='dnerf')}, open('/tmp/lego_cam.json','w'))"

# 1. the canonical cloud   2. the tri-planes   3. the knots
PYTHONPATH=. conda run -n 4dre python scripts/visualization/export_canonical_scene.py \
  --model_path /cluster/scratch/misong/4dre/dnerf/lego_02 \
  --out ~/mingyang-song.github.io/projects/spdef/scenes/lego_canonical --camera_from /tmp/lego_cam.json
PYTHONPATH=. conda run -n 4dre python scripts/visualization/export_triplanes.py \
  --model_path /cluster/scratch/misong/4dre/dnerf/lego_02 \
  --out ~/mingyang-song.github.io/projects/spdef/triplanes/lego
PYTHONPATH=. conda run -n 4dre python scripts/visualization/export_knots.py \
  --model_path /cluster/scratch/misong/4dre/dnerf/lego_02 \
  --out ~/mingyang-song.github.io/projects/spdef/knots/lego \
  --camera_from ~/mingyang-song.github.io/projects/spdef/scenes/lego_canonical/scene.json
```

Both panels must be given the **same** camera or the linked cameras frame two different views —
step 1 embeds it and step 3 copies it back out of what step 1 wrote, so they cannot drift. There is
no `--check` for a model with no packed bundle (lego_02 has none); the browser-side `parity` block
still ties the curve to torch, and the forward path itself was verified end-to-end on bouncingballs.

**The frame count is NOT recoverable from the checkpoint alone, and getting it wrong is silent.**
`capacity = floor(num_time_steps · knot_ratio / interval_stride)`, so inverting it gives a *range*:
bouncingballs (ratio 1.0, stride 2) pins 75 knots to 150 frames, but lego at ratio 0.3 gives 7 knots
for anything from **47 to 53** frames. The old code rounded `capacity·stride/ratio` and returned 47
— three frames short, which misplaces every knot on a timeline that maps `t = frame/(frames-1)`, and
nothing on the page would have looked broken. Both exporters now read `len(transforms_train.json
frames)` via the `source_path` in `scene_config.yaml`, fall back to the inversion only where it is
unambiguous, and otherwise demand `--num_frames`. The two copies of that logic (`export_knots.py`
holds `frame_count_candidates` + `frames_from_dataset`, `export_triplanes.py` has it inline in
`sequence_length`) must be changed together.

A new example also needs the **rank** to be within the panel's reach: `field.html` carries
`uniform float u_w[6]`, bounded at draw time by the field's own `u_rank` (bouncingballs 6, lego 1).
A rank-1 atlas is two tiles wide, so an unbounded 6-term loop would `texelFetch` outside it —
undefined per the ES 3.0 spec, and a NaN there poisons the whole splat colour. Rank > 6 throws on
load rather than rendering something wrong.

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
