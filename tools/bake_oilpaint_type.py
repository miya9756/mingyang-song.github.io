#!/usr/bin/env python3
"""Rebuild assets/oilpaint_type.jpg — the picture inside the Oil Paint Tuner's letterforms.

    conda run -n 4dre python tools/bake_oilpaint_type.py

The Miscellany shelf sets each item's title as a window onto the thing it links to: the
glyphs are clipped out of a picture with `background-clip:text` and the picture is revealed
on hover. The museum's window is a render of the reconstruction it hangs; this one has to be
a PAINTING MADE BY THE PAGE ITSELF, or the window is showing something the link does not do.

So this runs the real pipeline. `oilpaint` lives in the sibling repo where it is authored --
see the port note in that repo's .claude/skills/ship-to-site -- and this script imports it
from there rather than vendoring a second copy into a site that has no build step. It is an
OFFLINE tool: nothing on the site imports it, and the only thing that ships is the JPEG.

TWO THINGS ARE LOAD-BEARING, and the second is the reason this is a script rather than one
ffmpeg line.

1. THE CROP IS 900x404, the same as assets/museum_type.jpg, so both windows crop the same way
   inside a title box that is about 440 px wide at the top layout. `cover` is bound by WIDTH
   there, so a taller image would only reveal rows nobody sees.

2. THE FILL IS MEASURED AS TEXT, because every pixel of it is a glyph on #f4f2ec paper. A raw
   painting is far too light: the museum's own render measured 1.9:1 before it was toned, and
   large text has to clear 3:1. The tone is one blend toward --ink with the chroma put back --
   NOT a brightness curve, which would take the colour out with the light and leave grey
   letters. The script refuses to write a file that does not clear the bar, so a re-bake from
   a different source cannot silently ship unreadable type.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Where the pipeline is AUTHORED. Not a dependency of the site: only this script needs it.
PKG = os.path.expanduser("~/oil-paint-hack")

W, H = 900, 404                     # exactly assets/museum_type.jpg's frame
PAPER = (0xF4, 0xF2, 0xEC)          # misc/index.html's --bg, the ground these glyphs sit on
INK = (0x16, 0x18, 0x1D)            # its --ink, the colour the untoned fill is blended toward
FLOOR = 3.0                         # AA for large text; museum_type.jpg's worst pixel is 3.53


def _lin(v):
    v = np.asarray(v, dtype=np.float64) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def _lum(rgb):
    v = _lin(rgb)
    return 0.2126 * v[..., 0] + 0.7152 * v[..., 1] + 0.0722 * v[..., 2]


def tone(img, mix, sat):
    """Blend toward --ink, then put the chroma back.

    A plain blend darkens and desaturates in one move, and desaturating is the half that
    hurts: the point of the window is that the letters are visibly PAINT. Restoring the
    chroma about each pixel's own mean recovers the colour without touching the luminance
    the contrast was won with.
    """
    a = np.asarray(img, dtype=np.float64)
    a = a * (1.0 - mix) + np.array(INK, dtype=np.float64) * mix
    m = a.mean(axis=2, keepdims=True)
    return np.clip(m + (a - m) * sat, 0, 255)


def contrast(img):
    l = _lum(img)
    lp = float(_lum(np.array(PAPER, dtype=np.float64)))
    r = (lp + 0.05) / (l + 0.05)
    return float(r.min()), float(np.median(r)), float(r.max())


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=os.path.join(ROOT, "misc", "oilpaint", "div2k_0465.jpg"),
                    help="the photograph to paint; defaults to the tuner's own sample, so "
                         "the window shows what the page shows when it opens")
    ap.add_argument("--out", default=os.path.join(ROOT, "assets", "oilpaint_type.jpg"))
    # Painted a little above the shipped width so the marks keep their edges through the
    # downscale. Well past the pipeline's own 1000 px working floor, below which its stroke
    # allocation saturates and every mark comes out the same size.
    ap.add_argument("--paint-width", type=int, default=1350)
    ap.add_argument("--palette", default="impressionist")
    ap.add_argument("--mix", type=float, default=0.60, help="blend toward --ink")
    ap.add_argument("--sat", type=float, default=1.70, help="chroma restored after the blend")
    ap.add_argument("--quality", type=int, default=84)
    a = ap.parse_args()

    sys.path.insert(0, PKG)
    from oilpaint.pipeline import PaintConfig, paint          # noqa: E402

    im = Image.open(a.src).convert("RGB")
    # Centre crop to the frame's aspect, then paint at the working width. Cropping BEFORE the
    # render rather than after matters: the stroke sizes are chosen for the canvas, so
    # painting a wide picture and then cutting a band out of it gives marks that read as too
    # small for the frame they end up in.
    tw, th = im.width, int(round(im.width * H / W))
    if th > im.height:
        th, tw = im.height, int(round(im.height * W / H))
    im = im.crop(((im.width - tw) // 2, (im.height - th) // 2,
                  (im.width - tw) // 2 + tw, (im.height - th) // 2 + th))
    im = im.resize((a.paint_width, int(round(a.paint_width * H / W))), Image.LANCZOS)

    cfg = PaintConfig(palette=a.palette)
    # The pipeline works in float [0,1] on both sides -- see scripts/paint.py, which loads and
    # saves through the same conversion. Handing it uint8 silently paints a picture whose every
    # channel is 255x too bright, which comes back as a flat white rectangle rather than an error.
    out, info, sb = paint(np.asarray(im, dtype=np.float32) / 255.0, cfg)
    print("painted %dx%d, %d strokes, %.1f%% bare"
          % (out.shape[1], out.shape[0], len(sb), 100 * info["bare"]))

    small = np.asarray(Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
                       .resize((W, H), Image.LANCZOS), dtype=np.float64)
    raw = contrast(small)
    toned = tone(small, a.mix, a.sat)
    # 4:2:2 rather than 4:4:4: this is a painting seen through letterforms a few hundred
    # pixels wide, so half-resolution chroma is invisible and costs about a third of the file.
    Image.fromarray(toned.round().astype(np.uint8)).save(a.out, quality=a.quality,
                                                         subsampling=1, optimize=True)
    # MEASURED AFTER THE ENCODE, not before. The bar is a property of the bytes that ship,
    # and JPEG moves pixels -- a ringing overshoot at a bright edge lands exactly where the
    # worst pixel already is. Written first and re-read, so what is checked is the file.
    lo, med, hi = contrast(np.asarray(Image.open(a.out).convert("RGB"), dtype=np.float64))
    print("contrast on #f4f2ec paper: raw worst %.2f:1  ->  shipped worst %.2f:1, "
          "median %.2f:1, best %.2f:1" % (raw[0], lo, med, hi))
    if lo < FLOOR:
        os.remove(a.out)
        sys.exit("worst pixel is %.2f:1, under the %.1f:1 large-text bar -- raise --mix"
                 % (lo, FLOOR))
    print("wrote %s (%.0f KB)" % (a.out, os.path.getsize(a.out) / 1024))


if __name__ == "__main__":
    main()
