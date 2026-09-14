#!/usr/bin/env python3
"""Rebuild assets/web_bg.png — the landing page's corner backdrop — from the full-size artwork.

    conda run -n TempFormer python tools/bake_web_bg.py --src ~/art/web_bg_master.png

Two things happen here that the page cannot do for itself.

1. THE CORNER FADE IS BAKED INTO THE ALPHA CHANNEL, and it must stay that way.
   The drawing is pinned to the viewport's bottom-right corner, so it bleeds off the right and
   bottom edges and only its top and left edges are ever cut. Both have to dissolve to nothing.
   A CSS mask cannot do that with one gradient: `linear-gradient(to bottom right, …)` puts the
   top-right corner halfway along the ramp, so the drawing met the top edge at ~50-67 % opacity
   and left a visible horizontal seam. The fade has to be the *product* of two axis-aligned
   ramps, one per cut edge — expressible in CSS only via `mask-composite`, which has patchy
   support and degrades to *union* (i.e. worse) rather than gracefully. Baked, it is exact and
   needs no vendor prefixes.
   The ramps are smoothstep rather than linear because a linear fade has a kink in its first
   derivative where it reaches full opacity, and that kink is itself faintly visible as a line.

2. IT IS DOWNSCALED AND QUANTISED. The master is ~2000 px / 3.4 MB; the page never paints it
   wider than 800 CSS px, so 1600 px covers a retina panel exactly. Line art quantises almost
   losslessly — 192 colours costs about 1/255 of mean error once composited at the opacity the
   page uses — and the baked fade empties over half the canvas, which compresses well. The
   result is ~490 KB, in family with the teasers rather than seven times their size.

Keep the master somewhere outside this repo; only the derived asset is committed.
"""
import argparse
import os

import numpy as np
from PIL import Image

W, H = 1600, 1000         # 2x the 800 CSS px the page paints, matching `aspect-ratio:8/5`
FADE_X, FADE_Y = 0.62, 0.58   # fraction of the box each edge ramp spans
COLORS = 192


def smoothstep(u, edge):
    t = np.clip(u / edge, 0, 1)
    return t * t * (3 - 2 * t)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="full-size artwork, RGBA with a transparent ground")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "assets", "web_bg.png"))
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGBA").resize((W, H), Image.LANCZOS)
    px = np.asarray(im).astype(np.float64)

    y, x = np.mgrid[0:H, 0:W]
    px[..., 3] *= smoothstep(x / (W - 1), FADE_X) * smoothstep(y / (H - 1), FADE_Y)

    top, left = px[0, :, 3].max(), px[:, 0, 3].max()
    assert top < 0.5 and left < 0.5, f"fade does not reach zero (top {top}, left {left})"

    baked = Image.fromarray(np.clip(px + 0.5, 0, 255).astype(np.uint8))
    baked.quantize(colors=COLORS, method=Image.FASTOCTREE).save(
        a.out, optimize=True, compress_level=9)

    print(f"{a.src} -> {a.out}")
    print(f"  {W}x{H}, {COLORS} colours, {os.path.getsize(a.out)/1024:.0f} KB")
    print(f"  alpha is 0 along the top and left edges; {(px[..., 3] < 0.5).mean():.0%} of the "
          f"canvas is empty")


if __name__ == "__main__":
    main()
