---
name: site-design
description: The design contract for this personal site — card pattern, gradient active state, theme variables, motion and accessibility rules, and the layout decisions already made and why. Read BEFORE writing or editing any CSS or markup in index.html or projects/smv/index.html, so a new element matches the system instead of inventing a parallel one.
---

# Site design contract

Hand-written CSS, no framework, no build. One inline `<style>` block per page:
the landing page ([index.html](../../../index.html)), the SMV viewer
([projects/smv/index.html](../../../projects/smv/index.html)), the SpDef project page
([projects/spdef/index.html](../../../projects/spdef/index.html)), and the camera-noise
playground ([projects/grain/index.html](../../../projects/grain/index.html)). They are
**separate design systems that rhyme** — do not try to share tokens between them. The landing
page is theme-aware dark/light on warm paper; the viewer is a fixed warm-paper palette; SpDef
is its deliberately cool counterpart; Grain is neutral graphite with one darkroom-amber accent.
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
- **Every page ends `© 2026 Mingyang Song · All rights reserved.`** — landing, SMV, SpDef and
  Grain, using each page's own `footer{…}` rule. Nothing on this site is offered under an open
  licence, and a public repo that says nothing is routinely read as an invitation; `/LICENSE`
  at the repo root carries the scope. **The claim covers Mingyang's own text, artwork and code
  only**, so the three project pages add "Third-party code and datasets remain under their own
  licences" and keep their *Built with* (ffmpeg.wasm, fflate, antimatter15's `splat`) and
  *Datasets* / *Datasets & credits* (D-NeRF / HyperNeRF / NeRF-DS / SIDD / Kodak) blocks. Those
  attributions are load-bearing — the reserved-rights line is only honest next to them.
  (The SMV viewer page had no copyright line at all until 2026-07-29, despite this note
  previously claiming otherwise. It has one now.)
