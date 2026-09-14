#!/usr/bin/env python3
"""Rebuild assets/room_type.jpg — the picture inside The Painted Room's letterforms.

    conda run -n 4dre python tools/bake_room_type.py

The Miscellany shelf sets each item's title as a window onto the thing it links to. The
museum's window is a render of the reconstruction it hangs and the tuner's is a painting the
tuner made, so this one has to be A RENDER OF THE ROOM ITSELF, made by the page's own
renderer -- an illustration of it would be showing something the link does not do.

So this script drives the real page in a real browser and photographs it. Two awkward facts
shape how:

1. THE ROOM IS RENDERED THROUGH THE WEBGL2 BACKEND HERE, not WebGPU, and that is a property
   of this box rather than a choice. Chromium will not hand a WebGPU canvas's pixels to a
   screenshot in this headless setup -- verified down to a minimal three.js cube, whose clear
   colour never reached the image -- and reading the framebuffer back instead loses the Dawn
   instance mid-map. three.js compiles the same node graph for both backends, so the WebGL2
   picture is the same picture; `forceWebGL` is the only edit made to the page.

2. THE FILL IS MEASURED AS TEXT, because every pixel of it ends up as a glyph on #f4f2ec
   paper. The room is a dark scene, so unlike the other two windows the danger is the
   opposite one -- it starts too DARK rather than too light, and a window that measures 15:1
   is not a picture, it is a silhouette. So the tone here LIFTS toward the paper and then
   puts the chroma back, and the check has a ceiling as well as a floor: under 3:1 the type
   is unreadable, and over about 9:1 nothing of the room survives except its lamp.

Refuses to write a file that misses either bound, so a re-bake after the room is relit cannot
silently ship a window that is unreadable or blank.
"""
import argparse
import os
import socket
import subprocess
import sys
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "misc", "museum", "room", "index.html")
TMP = os.path.join(ROOT, "misc", "museum", "room", "_bake.html")

W, H = 900, 404                     # exactly assets/museum_type.jpg's frame
SHOT_W, SHOT_H = 900, 506           # the stage is 16:9; the band above is cropped away
PAPER = (0xF4, 0xF2, 0xEC)          # misc/index.html's --bg, the ground these glyphs sit on
INK = (0x16, 0x18, 0x1D)            # its --ink
# AA for large text, and the point past which the window stops being a picture. The ceiling is
# CALIBRATED AGAINST THE OTHER TWO WINDOWS rather than invented: museum_type.jpg (also a render of a
# dark scene) measures min 3.53 / median 10.27, and oilpaint_type.jpg (a bright painting) 3.57 /
# 6.57. A ceiling of 9.5 was tighter than the museum's own shipped window, and forcing the median
# under it flattened this one into a blue-grey wash -- the band was so narrow that nothing of the
# room's own range survived.
FLOOR, CEIL = 3.0, 11.0
RAW = os.path.join(ROOT, "assets", ".room_type_raw.png")   # cached render, so re-toning is instant

GL_ARGS = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


def _lin(v):
    v = np.asarray(v, dtype=np.float64) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def _lum(rgb):
    v = _lin(rgb)
    return 0.2126 * v[..., 0] + 0.7152 * v[..., 1] + 0.0722 * v[..., 2]


def contrast(img):
    l = _lum(img)
    lp = float(_lum(np.array(PAPER, dtype=np.float64)))
    r = (lp + 0.05) / (l + 0.05)
    return float(r.min()), float(np.median(r)), float(r.max())


def tone(img, lo_ratio, hi_ratio, gamma, sat):
    """Map the render's luminance into a band that is legible AS TYPE, then put the chroma back.

    A PLAIN BLEND CANNOT DO THIS, WHICH IS WHERE THE FIRST VERSION FAILED. The other two windows
    blend toward --ink because their sources are bright paintings whose whole range is too light.
    This source is a dark room WITH A LAMP IN IT: its median measures 11.6:1 against the paper --
    far too dark -- while its highlights measure 0.89:1, i.e. BRIGHTER THAN THE PAPER, which is a
    hole in the letterform rather than a glyph. One number cannot move both ends, and lifting enough
    to fix the median pushes the highlights further past the paper.

    So this is a band map, and the band is stated as contrast ratios because that is what has to be
    true of the result. Each pixel's luminance is placed between the two, monotonically, and its RGB
    is SCALED to hit it rather than blended toward a colour -- scaling preserves the hue, which is
    the whole reason for a picture in the letters. `gamma` shapes where the midtones land: below 1
    opens up the dark half of the room, which is most of it.
    """
    lin = _lin(np.asarray(img, dtype=np.float64))
    lp = float(_lum(np.array(PAPER, dtype=np.float64)))
    L = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    # The luminances the two ratios correspond to. Brighter pixel -> smaller ratio, so lo_ratio is
    # the TOP of the luminance band.
    hi = (lp + 0.05) / lo_ratio - 0.05
    lo = (lp + 0.05) / hi_ratio - 0.05
    t = (L - L.min()) / max(L.max() - L.min(), 1e-9)
    target = lo + (hi - lo) * np.power(t, gamma)
    scale = (target / np.maximum(L, 1e-6))[..., None]
    out = np.clip(lin * scale, 0, 1)
    # A PURE BLACK PIXEL CANNOT BE SCALED INTO THE BAND, and the room has plenty of them -- the
    # enclosure past the ruin is meant to be nothing at all. Multiplying zero by anything is zero,
    # so the first band map left the darkest pixels at the paper's own maximum ratio and the median
    # never came down. The floor is therefore ADDITIVE: the luminance weights sum to 1, so adding
    # the same amount to r, g and b raises luminance by exactly that amount. It desaturates the
    # deepest shadows very slightly, which is what veiling glare does to a real print anyway.
    Lout = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
    out = np.clip(out + np.maximum(lo - Lout, 0)[..., None], 0, 1)
    # back to sRGB
    out = np.where(out <= 0.0031308, out * 12.92, 1.055 * np.power(out, 1 / 2.4) - 0.055) * 255.0
    m = out.mean(axis=2, keepdims=True)
    return np.clip(m + (out - m) * sat, 0, 255)


def render(wait_ms, cam):
    """Photograph the room's stage through the WebGL2 backend. Returns a SHOT_W x SHOT_H array."""
    from playwright.sync_api import sync_playwright

    src = open(PAGE, encoding="utf-8").read()
    src = src.replace(
        "const renderer=new THREE.WebGPURenderer({canvas, antialias:true, alpha:false});",
        "const renderer=new THREE.WebGPURenderer({canvas, antialias:true, alpha:false, forceWebGL:true});")
    # THRIFT, and it costs the window nothing. There is no GPU on this box, so the software
    # rasteriser is doing a 40-step raymarch per pixel on a CPU -- minutes per frame at the shipped
    # settings. What this render becomes is a 900x404 strip seen through letterforms about 440 px
    # wide, so the march only has to be representative, not final: fewer steps is slightly more
    # dither in the beam, at a size where the beam is a few dozen pixels. The FLUTES are left alone,
    # because the columns are what the window is of.
    src = src.replace("const VOL_STEPS=40;", "const VOL_STEPS=12;")
    src = src.replace("reflector({resolutionScale:0.4})", "reflector({resolutionScale:0.3})")
    # Stop the loop after one more frame, so the screenshot is not fighting a rAF loop for a
    # stable page -- Chromium simply times out otherwise.
    src = src.replace("\nboot();\n</script>",
                      "\nwindow.__setcam=(y,p,d)=>{cam.yaw=y;cam.pitch=p;cam.dist=d;placeCamera();};"
                      "\nwindow.__freeze=()=>{renderer.setAnimationLoop(null);frame();return 1;};"
                      "\nwindow.__ready=1;\nboot();\n</script>")
    open(TMP, "w").write(src)

    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shot = os.path.join(ROOT, "_room_shot.png")
    try:
        time.sleep(1.2)
        with sync_playwright() as p:
            b = p.chromium.launch(args=GL_ARGS)
            pg = b.new_page(viewport={"width": SHOT_W, "height": SHOT_H + 260})
            pg.goto("http://127.0.0.1:%d/misc/museum/room/_bake.html" % port, wait_until="load")
            pg.wait_for_function("()=>window.__ready===1", timeout=40000)
            pg.wait_for_timeout(wait_ms)
            if cam:
                pg.evaluate("a=>window.__setcam(...a)", cam)
                pg.wait_for_timeout(wait_ms // 2)
            pg.evaluate("()=>window.__freeze()")
            pg.wait_for_timeout(6000)
            box = pg.locator(".stage").bounding_box()
            pg.screenshot(path=shot, clip=box, timeout=420000)
            b.close()
        return np.asarray(Image.open(shot).convert("RGB").resize((SHOT_W, SHOT_H), Image.LANCZOS),
                          dtype=np.float64)
    finally:
        srv.terminate()
        for f in (TMP, shot):
            if os.path.exists(f):
                os.remove(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(ROOT, "assets", "room_type.jpg"))
    ap.add_argument("--wait", type=int, default=50000,
                    help="ms to let the software renderer settle; it draws this scene slowly")
    ap.add_argument("--cam", default="-0.035,0.12,8.2",
                    help="yaw,pitch,dist -- the room's opening composition")
    ap.add_argument("--lo", type=float, default=3.9,
                    help="contrast ratio the BRIGHTEST pixel lands on (margin over the 3.0 floor, "
                         "because the JPEG encode costs a few tenths at exactly such an edge)")
    ap.add_argument("--hi", type=float, default=13.5,
                    help="contrast ratio the darkest pixel lands on")
    ap.add_argument("--gamma", type=float, default=0.45,
                    help="below 1 opens up the dark half of the room, which is most of it")
    ap.add_argument("--sat", type=float, default=1.25, help="chroma restored after the map")
    ap.add_argument("--from-raw", action="store_true",
                    help="re-tone the cached render instead of driving the browser again. The "
                         "render takes minutes on a software rasteriser and the tone is what "
                         "actually needs iterating.")
    ap.add_argument("--quality", type=int, default=86)
    a = ap.parse_args()

    cam = [float(x) for x in a.cam.split(",")] if a.cam else None
    if a.from_raw:
        if not os.path.exists(RAW):
            sys.exit("no cached render at %s -- run once without --from-raw" % RAW)
        shot = np.asarray(Image.open(RAW).convert("RGB"), dtype=np.float64)
        print("re-toning the cached render")
    else:
        shot = render(a.wait, cam)
        Image.fromarray(shot.astype(np.uint8)).save(RAW)
    # Centre-crop the 16:9 stage to the window's 2.23:1. The band lost is mostly ceiling and the
    # nearest water, neither of which carries the room.
    top = (SHOT_H - H) // 2
    band = shot[top:top + H]
    raw = contrast(band)
    toned = tone(band, a.lo, a.hi, a.gamma, a.sat)

    img = Image.fromarray(toned.astype(np.uint8))
    img.save(a.out, "JPEG", quality=a.quality, subsampling=1, optimize=True)
    # MEASURE THE FILE, NOT THE ARRAY. bake_oilpaint_type.py learned this: the encode moves the
    # worst pixel by a few tenths of a ratio, and it moves it at a bright edge, which is exactly
    # where the margin already is.
    back = np.asarray(Image.open(a.out).convert("RGB"), dtype=np.float64)
    lo, md, hi = contrast(back)
    print("raw     min %.2f  median %.2f  max %.2f" % raw)
    print("shipped min %.2f  median %.2f  max %.2f  (%d KB)"
          % (lo, md, hi, os.path.getsize(a.out) // 1024))
    if lo < FLOOR or md > CEIL:
        os.remove(a.out)
        sys.exit("REFUSED: worst %.2f:1 (need >= %.1f) / median %.2f:1 (need <= %.1f). "
                 "Adjust --lo / --hi / --gamma and re-run with --from-raw; nothing was written."
                 % (lo, FLOOR, md, CEIL))
    print("ok — clears %.1f:1 as large text on the shelf's paper" % FLOOR)


if __name__ == "__main__":
    main()
