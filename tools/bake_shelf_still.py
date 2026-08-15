#!/usr/bin/env python3
"""Rebuild assets/misc_shelf.png — the still life standing on the Miscellany shelf.

    python3 tools/bake_shelf_still.py --src ~/art/misc_asset_1.png

Two things happen here, and one thing deliberately does NOT.

1. THE TRANSPARENT MARGIN IS CROPPED AWAY, and the page depends on it. The master is an A4
   canvas (2480x3508) with the drawing floating inside it; the shelf places the vignette with
   every offset in .still off the drawing's own edges -- the cloth's lowest fold and the right-
   most ink -- so the drape hangs a measured distance below the board and the object overhangs
   the case by a measured amount. Leave the margin in and all of those shift by whatever
   fraction of the canvas the artist happened to leave around the drawing.

2. IT IS DOWNSCALED to 2x the 360 CSS px the page paints, which covers a retina panel exactly.

3. IT IS **NOT** QUANTISED, unlike assets/web_bg.png — do not "fix" that by reusing the other
   script's FASTOCTREE step. That asset is line art on a transparent ground, which quantises
   almost losslessly. This one is a painting: the tablecloth is a wide, smooth gradient across
   most of the image, and 192 colours turns it into blotchy contour patches with the brown ink
   speckling along its edges. Measured at 520 px wide: mean error is a respectable 2.1/255, but
   the error is concentrated exactly where the eye reads a smooth surface, so the mean says
   nothing useful and the banding is obvious side by side. 532 KB unquantised is in family with
   the rest of assets/ (smv_teaser 564 KB, web_bg 490 KB, grain_teaser 449 KB) and is the right
   trade. If the page ever needs to be lighter, the answer is WebP (~113 KB at the same size
   and no banding), not fewer colours.

Keep the master somewhere outside this repo; only the derived asset is committed.
"""
import argparse
import os

from PIL import Image

W = 720          # 2x the 360 CSS px .still paints at its widest


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="the master, RGBA with a transparent ground")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "assets", "misc_shelf.png"))
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("the source is fully transparent")
    im = im.crop(box)

    h = round(W * im.size[1] / im.size[0])
    im.resize((W, h), Image.LANCZOS).save(a.out, optimize=True, compress_level=9)

    print(f"{a.src} -> {a.out}")
    print(f"  cropped to content {box}, then {W}x{h}, "
          f"{os.path.getsize(a.out) / 1024:.0f} KB")
    print(f"  the page paints it {W // 2} CSS px wide; set .still's width/height to "
          f"{W // 2}x{round(h / 2)} and the <img> attributes to {W}x{h}")


if __name__ == "__main__":
    main()
