---
name: site-design
description: The design contract for this personal site — card pattern, gradient active state, theme variables, motion and accessibility rules, and the layout decisions already made and why. Read BEFORE writing or editing any CSS or markup in index.html or projects/smv/index.html, so a new element matches the system instead of inventing a parallel one.
---

# Site design contract

Hand-written CSS, no framework, no build. Two pages, each with one inline `<style>` block:
the landing page ([index.html](../../../index.html)) and the viewer
([projects/smv/index.html](../../../projects/smv/index.html)). They are **separate design
systems that rhyme** — do not try to share tokens between them. The landing page is
theme-aware dark/light; the viewer is a fixed warm-paper palette.

Run [verify-site](../verify-site/SKILL.md) after any change here.

## Landing page

### Tokens
Every colour is a `:root` var with a `prefers-color-scheme: light` counterpart. **Add both
or neither** — a var defined in only one theme fails silently in the other.

`--bg --fg --dim --accent --line --accent-ring --shadow --grad-wash` are per-theme.
`--grad` (periwinkle `#6e89e0` → amber `#e0a34c`) is theme-independent and is **the**
active-state accent. Change it in one place to retint every card.

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
background: var(--grad-wash)                     padding-box,   /* faint interior tint */
            linear-gradient(var(--bg),var(--bg))  padding-box,   /* opaque interior      */
            var(--grad)                           border-box;    /* the 1px ring         */
```

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
is still hoverable. Dashed border marks it as an empty slot.

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
- **`© 2026 Mingyang Song` footer** is back, using the `footer{…}` rule that was left in
  place. It covers Mingyang's own text, artwork and code only — the viewer page carries
  separate *Built with* (third-party libraries) and *Datasets* (D-NeRF / HyperNeRF /
  NeRF-DS) attribution, and those must stay.
