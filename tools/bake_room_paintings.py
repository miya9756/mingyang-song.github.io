#!/usr/bin/env python3
"""Derive the Painted Room's five wall textures from Mingyang's masters.

The masters are `assets/oil_tune_<id>.png` -- 14-20 MB apiece, 86 MB the set, RGBA at up to
4096x3072.  They are photographs of his repainted by Oil Paint Tuner, and like every other master
in this repo (web_bg.png, misc_asset_1.png, the backdrop pair, the TempFormer teaser) they are
**not committed**: .gitignore names them, and only what this script writes ships.

Three decisions, all measured rather than chosen:

  * **1600 px on the long edge.**  A painting is a quad on a wall the visitor can dolly toward, and
    the room clamps that approach well before a 1600 px texture runs out of pixels: at the closest
    the camera is allowed, the largest canvas covers about 1150 device px on a 2x 1440p screen, so
    the texture is still oversampled.  Doubling to 3200 would quadruple the download to buy detail
    nothing in the room can reach.

  * **WebP, quality 84.**  These are the one subject quantisation ruins -- the whole point of the
    pictures is the brushwork, which is high-frequency texture spread over every square inch, and
    it is exactly what a low-quality encode smooths into plastic.  Measured over the five against
    the resized master: mean absolute error 2.2-3.8/255, and the brush itself (mean |laplacian|,
    which is what a smoothing encoder eats first) retained at 77-83% on the three pictures whose
    subject IS impasto.  Checked by eye too, at 1:1 against q90 and against the uncompressed
    resize, because the metric cannot tell a lost bristle from lost sensor grain: the three are
    indistinguishable, and q90 costs 44% more bytes for it.  JPEG at q84 costs 36% more than WebP
    and scores worse.  Total 794 KB for the set, a third of the Bellotto bundle next door.

    (`storm` and `ridge` retain only ~50% by that laplacian measure.  They are a smooth sky and a
    cloud bank -- almost all of what the encoder drops there is grain rather than brush, which is
    why the eye check is the one that decided this and the metric only flagged where to look.)

  * **No alpha.**  The masters are RGBA with a fully opaque alpha channel; carrying it would cost
    bytes for a constant.  A painting on a wall is opaque by construction.

The `<id>`s are the masters' own and are not a sequence (`01`, `02`, `3`, `4`, `5`); the shipped
names are the slugs the page's PAINTINGS table uses, so the room never has to know about them.

    conda run -n 4dre python tools/bake_room_paintings.py
"""
import sys, json
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow: conda run -n 4dre python tools/bake_room_paintings.py")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "misc" / "museum" / "room" / "paintings"
LONG_EDGE = 1600
QUALITY = 84

# master id -> shipped slug.  The slug is what the page's PAINTINGS table names.
WORKS = [("01", "wisteria"), ("02", "snow"), ("3", "storm"), ("4", "grossmunster"), ("5", "ridge")]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total, manifest = 0, []
    for mid, slug in WORKS:
        src = ROOT / "assets" / f"oil_tune_{mid}.png"
        if not src.exists():
            sys.exit(f"missing master {src}\n"
                     "The masters are gitignored on purpose -- fetch them from wherever they live.")
        im = Image.open(src).convert("RGB")
        w, h = im.size
        nw, nh = (LONG_EDGE, round(LONG_EDGE * h / w)) if w >= h else (round(LONG_EDGE * w / h), LONG_EDGE)
        small = im.resize((nw, nh), Image.LANCZOS)
        dst = OUT / f"{slug}.webp"
        small.save(dst, "WEBP", quality=QUALITY, method=6)
        n = dst.stat().st_size
        total += n
        manifest.append((slug, nw, nh, n))
        print(f"  {slug:14s} {w}x{h} -> {nw}x{nh}  {n/1024:6.0f} KB")
    print(f"  {'total':14s} {'':13s}    {total/1024:6.0f} KB")
    # The page hardcodes each painting's aspect ratio to size its frame; print them so a re-bake
    # that changes a crop is caught here rather than by a stretched picture in the room.
    print("\naspect ratios for the page's PAINTINGS table (w/h):")
    for slug, nw, nh, _ in manifest:
        print(f"  {slug:14s} {nw/nh:.4f}   ({nw}x{nh})")


if __name__ == "__main__":
    main()
