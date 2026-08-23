---
name: site-design
description: The design contract for this personal site — card pattern, gradient active state, theme variables, motion and accessibility rules, and the layout decisions already made and why. Read BEFORE writing or editing any CSS or markup in index.html or projects/smv/index.html, so a new element matches the system instead of inventing a parallel one.
---

# Site design contract

Hand-written CSS, no framework, no build. One inline `<style>` block per page:
the landing page ([index.html](../../../index.html)), the SMV viewer
([projects/smv/index.html](../../../projects/smv/index.html)), the SpDef project page
([projects/spdef/index.html](../../../projects/spdef/index.html)), the camera-noise
playground ([projects/grain/index.html](../../../projects/grain/index.html)), and the
sliding-block machine ([projects/tempformer/index.html](../../../projects/tempformer/index.html)).
They are
**separate design systems that rhyme** — do not try to share tokens between them. The landing
page is theme-aware dark/light on warm paper; the viewer is a fixed warm-paper palette; SpDef
is its deliberately cool counterpart; Grain is neutral graphite with one darkroom-amber accent;
TempFormer is a pale bench-top green with a deep pine one. The last two are both **hue-poor on
purpose** — on those pages the saturated colour is the data, so an opinionated accent competes
with the thing the reader is comparing.
A new project page picks its own palette the same way — the only thing it inherits is the
page-chrome trio below.

The two most recent project pages also share **bones**, not just chrome: Fraunces display serif
for `h1`/`h2`/`h3`, the same back pill, card radius, section rhythm and section order
(work → citation → datasets → footer). Follow that for the next one; only the temperature and
the accent should change.

Run [verify-site](../verify-site/SKILL.md) after any change here.

## Page chrome — the one thing every page must share

The three pages have independent palettes, but **every page, including any future project
page, declares the same three things.** `verify.py` FAILs without them.

```html
<meta name="theme-color" content="#f4f2ec">              <!-- or one per scheme, with media= -->
```
```css
:root{ color-scheme: light }        /* `light dark` if the page is themed */
html { background: var(--bg) }      /* not just body */
```

Why, since the page CSS alone looked correct in isolation: these three cover the surfaces the
page's own background does **not** reach, and the browsers disagree about all of them. Chrome
infers the UA canvas from the body background; Safari leaves it white. That gap is the canvas,
scrollbars, form controls, the iOS toolbars, and the overscroll area Safari rubber-bands into.
It is invisible on a near-white page and glaring on this site's warm paper — the landing page
rendered warm in Chrome and pure white in Safari with byte-identical CSS.

`theme-color` is markup and `--bg` is CSS, so nothing links them; `verify.py` WARNs when a
theme-color hex appears nowhere in the page's CSS, which is the retune-the-palette-and-forget
failure. Pointing it at a header colour instead is legitimate — hence WARN, not FAIL.

**Keep off-whites off white.** The light `--bg` was `#fbfaf8`, 3/255 from `#ffffff`. That is
inside the noise floor of sRGB → display-profile conversion on a wide-gamut screen, so the
warmth survived in one browser and not the other. It is now `#f4f2ec`, the same warm paper as
the viewer. A tint that is meant to be seen needs to be a colour, not a rounding error.

## Landing page

### Tokens
Every colour is a `:root` var with a `prefers-color-scheme: light` counterpart. **Add both
or neither** — a var defined in only one theme fails silently in the other.

`--bg --surface --fg --dim --accent --line --accent-ring --shadow --grad-wash` are per-theme.
`--grad` (periwinkle `#6e89e0` → amber `#e0a34c`) is theme-independent and is **the**
active-state accent. Change it in one place to retint every card.

**`--surface` is what a card sits on; `--bg` is what the page sits on.** Cards used to be
`background:transparent`, which on the warm paper `--bg` made them hairline boxes that only
became objects on hover. `--surface` is always a step *away from* `--bg` in the direction of
more light — `#fdfbf6` over `#f4f2ec` in light, `#161a20` over `#0e1014` in dark — so the same
token expresses "raised" in both themes without a per-theme rule. Anything card-like uses it;
anything page-like uses `--bg`.

### The card is the click target
Cards are `<a class="card">` wrapping their whole content — never a card with a link
inside it. That makes the entire tile clickable and gives keyboard users one stop.
Consequences to respect:

- `:focus-visible` must stay styled. A card with an invisible focus state is unusable by keyboard.
- Add `:focus-visible` alongside every `:hover` rule, or the two states diverge.
- `<a>` is transparent content, so `<h3>`/`<p>`/`<div>` inside it is valid — but a `<span>`
  cannot contain an `<h3>`. Use `<div>` for block wrappers inside a card.

### Gradient border technique
`border-color` cannot take a gradient, and `border-image` flattens `border-radius`. The
active state layers three backgrounds with different clip boxes:

```css
background: var(--grad-wash)                              padding-box,  /* faint interior tint */
            linear-gradient(var(--surface),var(--surface)) padding-box,  /* opaque interior     */
            var(--grad)                                    border-box;   /* the 1px ring        */
```

The opaque interior must be **`--surface`, matching the card's resting background** — if the two
disagree the card changes colour under the cursor instead of just lifting, which reads as a bug.

with `border-color:transparent`. **This uses the `background` shorthand, so anything that
also wants a background on the card will be overwritten.** That is why `.card.art` puts its
photo on a `::before` instead — so the card keeps its gradient border. Do the same for any
future image-backed card.

Gradient text is `background:var(--grad)` + `background-clip:text` + `color:transparent`
**and** `-webkit-text-fill-color:transparent` (Safari ignores `color` alone here, and the
failure mode is invisible text).

### One accent focal point per card
When the tag and the CTA were both accent-coloured, neither read as the action. Metadata is
`--dim`; exactly one element carries the accent. Keep it that way.

### Variants
`.card` base · `.card.feat` full-bleed teaser on top, padding moves to `.featbody` ·
`.card.mini` contact tiles in a `.cards2` auto-fit grid · `.card.art` image-backed, its own
light-on-dark text since it sits on a photo in both themes · `.card.slot` placeholder.

**`.card.slot` is the one card that is a `<div>`, not an `<a>` — do not "fix" it.** A
placeholder has no destination, so making it an anchor would put it in the tab order and
promise a click that goes nowhere. It therefore also has to *neutralise* the base
`.card:hover` rules (transform, shadow, gradient border, gradient `h3`), because a `<div>`
is still hoverable. Dashed border marks it as an empty slot. It is also the one card that opts
back out of `--surface` and the resting shadow (`background:transparent;box-shadow:none`) — an
empty slot is a hole in the page, not an object on it.

To promote a slot to a real project: swap `<div class="card slot">` for
`<a class="card feat" href="…">`, wrap the text in `<div class="featbody">`, and add the
teaser `<img class="teaser">` above it with the file's real pixel `width`/`height` and real
`alt` text. The inline comment in `index.html` says the same thing at the call site.

### Backdrop photograph (`body::after`) and the frosted sheet (`.wrap::before`)

A full-bleed `position:fixed` painting of Mingyang's, in two frames: `assets/zuri_bg.jpg`
(Zurich at sunset, landscape) and `assets/bg_portrait.jpg` (the pier, portrait). They replaced
`assets/web_bg.png`, the corner line drawing; that asset and `tools/bake_web_bg.py` are still in
the repo but nothing references them. So is `assets/bg_landscape.jpg`, the first landscape frame.

- **The pair is chosen by `@media (orientation: portrait)`, not by a width breakpoint.** The
  query asks exactly what the crop cares about: `cover` throws away the long axis, so the 16:9
  landscape frame arrives on a phone as a vertical slice. Orientation also gets a narrow desktop
  window right, which a `max-width` rule would not. The url lives in `--art-img`, so only the
  substituted one is ever fetched.
- **`.wrap` must keep `position:relative;z-index:1`.** `body::after` is positioned, so without
  it the painting paints *over* the text. This is the one place on the landing page where a
  stacking context is deliberate, and it is also what puts `.wrap::before` above the painting.
- **The tone is a runtime filter, not baked, because the two themes pull opposite ways** — dark
  presses the painting down into the ink with `brightness(.4)`, light leaves it near its own
  weight. One JPEG cannot carry both, so `--art-op` / `--art-filter` stay tokens; both themes
  define both, per the token rule.
- **`--art-op` and `--art-filter` are taste, and `--sheet` is legibility. Do not confuse them.**
  The painting once ran at a quarter opacity because that was the entire contrast budget: body
  text sat straight on it. It runs at full strength now because `.wrap::before` gives the text a
  ground instead. Changing the picture or its filter is therefore a free choice — re-measuring
  the sheet afterwards is not.

**The frosted sheet is the answer to "the grey text is unreadable", and it is the only one that
works here.** Over the Zurich painting, unveiled, `--fg` measures **1.18:1** against the purple
city in light mode and `--dim` sits under 4.5:1 across half the frame in dark. No text colour
fixes that: the picture runs from a yellow sky to a dark city *within one screen*, so any single
colour fails on one half of it. Nor does `contrast-color()` — it resolves against a declared
colour, never against what is actually painted behind. Five things are load-bearing:

- **The veil is the legibility; the blur is the look.** `--sheet` is a translucent `--bg` and is
  what the contrast is measured on. `--sheet-glass` (the `backdrop-filter`) only decides whether
  the show-through reads as glass or as a picture at low opacity. That split is why the
  `@supports` fallback raises the veil rather than simply dropping the filter.
- **THE FILTER CHAIN FLATTENS LUMINANCE AND THEN RESTORES CHROMA, AND THAT ORDER IS THE TRICK.**
  Contrast ratio is a function of luminance alone, so luminance variation is what breaks text —
  and colour is what makes the painting legible *as* a painting. `contrast(.35)` crushes both,
  `brightness(1.55)` puts the flattened result back on the paper, `saturate(3.6)` hands back only
  the colour. Measured against the plain frosted sheet it replaced: chroma spread more than
  **quadruples** (5.1 → 20.7 on the landscape) while luminance spread **falls** (12.3 → 8.4). More
  picture and safer text at once — which is what paid for the veil coming down from .82 to .64 and
  the blur from 20px to 12px. Removing either function inverts the effect. Dark needs no
  `contrast()`, since `body::after`'s `brightness(.4)` has already crushed the range, so its chain
  is deliberately one function shorter.
- **The two themes need very different veils — .64 against .28 — and that is not an oversight.**
  `body::after` already presses the painting toward `--bg` in dark, so it barely has to be
  covered; in light it arrives at full weight over paper.
- **The numbers are measured, over both assets, blurred and toned exactly as the CSS does it.**
  Worst pixel under the column: `--fg` 11.6:1 / `--dim` 4.84:1 light, 10.2:1 / 4.83:1 dark; the
  no-`backdrop-filter` fallback (.90 / .86) gives 4.99:1 / 6.57:1. **`--dim` is always the floor,
  and it is close** — two points of veil is about .09 of contrast ratio, so .62 / .26 is the edge
  of AA and below it is not.
- **The rim, the sheen and the cast shadow are free, and they are most of the glass.** They paint
  once into the element's own layer; only the `backdrop-filter` is resampled as the sheet scrolls
  over a fixed painting. That is also the argument against going further: real edge refraction
  needs `backdrop-filter:url(#…)` with an `feDisplacementMap`, which Chrome has and Safari and
  Firefox do not — and an unsupported function invalidates the **whole** declaration, taking the
  blur and therefore the contrast floor with it. **Do not add it.**
- **`z-index:-1`, and the horizontal inset only above 900px.** The negative index keeps the sheet
  behind `.wrap`'s content while staying inside the stacking context `.wrap` opens, which is both
  what puts it over the painting and what lets `backdrop-filter` see the painting. `.wrap` is the
  full viewport width on a phone, so the `-28px` overhang that makes the sheet read as an object
  on a desktop would push a horizontal scrollbar there. Its `border-radius` is the cards' 12px,
  not a rounder one of its own — the sheet is the ground the cards sit on, and two different
  corner radii in one column read as two design systems. The rim reuses the card pattern's
  gradient-border technique (veil clipped to `padding-box` over `--sheet-rim` clipped to
  `border-box`), for the same reason the cards do: `border-color` takes no gradient and
  `border-image` flattens the radius.

**`.stamp` is the painting's caption, and it lives in the gutter.** *October 20, 2023 / 18:18
Zürich*, fixed to the viewport's bottom-left, standing on the picture rather than on the sheet.
Three decisions:

- **White in both themes, measured not assumed.** The picture's bottom-left corner stays dark
  under either `--art-filter`, and over the box the caption actually occupies white measures at
  worst **5.7:1**, typically 9–19:1, across 1280×1024 / 1440×900 / 1920×1080 / 2560×1440. No
  scrim needed. The `text-shadow` is insurance for a future painting, not what makes this one
  legible — re-measure if the picture is swapped for a lighter one.
- **`@media (min-width:1150px) and (orientation:landscape)`, and both halves are load-bearing.**
  The width is the gutter: the sheet is 864px wide with its overhang, so 1150px leaves 143px a
  side and narrower puts the caption under the glass. The orientation is the same question the
  backdrop asks — a tall desktop window can be 1200px wide and still be showing the portrait
  frame, which has no room for it and was never measured.
- **`aria-hidden`**, because the painting it captions is a CSS background and does not exist for
  a screen reader. Read aloud, a bare date and city after the footer is an orphan.

**The shipped JPEGs are derived; the masters are not in the repo.** `.gitignore` names them so
`git add assets/` cannot take them. There is no bake script because the transform is a plain
resize and encode:

```bash
ffmpeg -y -i <landscape master>.png -vf "scale=1920:1080:flags=lanczos" -q:v 4 assets/<name>.jpg
ffmpeg -y -i <portrait master>.png  -vf "scale=1170:2080:flags=lanczos" -q:v 4 assets/bg_portrait.jpg
```

200-350 KB each, in family with the teasers.

### Motion
Every transition and animation must be switched off in the existing
`@media (prefers-reduced-motion: reduce)` block. Add new ones to it in the same edit —
retrofitting is always forgotten.

### Images
Set `width`/`height` attributes to the file's real pixel dimensions so the box is reserved
and the page does not jump on load — `verify.py` does not check this, so check it yourself.
Give real `alt` text for content images; decorative backgrounds belong in CSS.
Prefer a transparent PNG for figures: a baked-in white background forces an ugly choice
between a glaring band in dark mode and a fake plate to hide it.

## Viewer

Different constraints: **one 96 KB `index.html`**, deliberately dense single-line helpers,
GLSL as template strings. Match that terseness; do not reformat wholesale. See
[CLAUDE.md](../../../CLAUDE.md) for the decode-path parity rules and the merge provenance —
both matter more than the styling.

The one hard UI rule: **the panel is the source of truth for view options.** Any new control
goes into `syncViewOptions()` and, if a scene may not support it, gets `_gate(id, ok, why)`.
`CLAUDE.md` explains why re-reading beats resetting.

## Deploy constraint that shapes markup

This repo is served from a **project-site subpath**
(`miya9756.github.io/mingyang-song.github.io/`), not a domain root. **Never write a
root-absolute path** (`/assets/…`, `/projects/…`) — it resolves locally and 404s in
production. The viewer's back button is `../../` for exactly this reason. `verify.py`
fails the build on root-absolute paths.

## Decisions already made — don't silently undo

- **Scene picker is split** dataset × scene; `loadBtn` resolves via `_selected()` on
  `sceneSel.value`, never `selectedIndex`.
- **Native camera res control was removed**; its render path is intentionally still there.
- **GitHub link was removed** — source cannot be published. Don't re-add it.
- **Blend is `n/a` on all shipped scenes** (`overlap_frames = 0`); an overlapped scene is
  planned, which will light it up on its own.
- **Every page ends `© 2026 Mingyang Song · All rights reserved.`** — landing, SMV, SpDef,
  Grain and TempFormer, using each page's own `footer{…}` rule. Nothing on this site is offered
  under an open licence, and a public repo that says nothing is routinely read as an invitation;
  `/LICENSE` at the repo root carries the scope. **The claim covers Mingyang's own text, artwork
  and code only**, so the pages that ship third-party material add "Third-party code and datasets
  remain under their own licences" and keep their *Built with* (ffmpeg.wasm, fflate,
  antimatter15's `splat`) and
  *Datasets* / *Datasets & credits* (D-NeRF / HyperNeRF / NeRF-DS / SIDD / Kodak) blocks. Those
  attributions are load-bearing — the reserved-rights line is only honest next to them.
  (The SMV viewer page had no copyright line at all until 2026-07-29, despite this note
  previously claiming otherwise. It has one now.)
