#!/usr/bin/env python3
"""Measure real text contrast against what is actually painted behind it.

The landing page sets type on translucent glass over a painting, so no declared colour tells
you the contrast - the ground changes with the picture, the veil, the blur and the scroll
position. contrast-color() cannot help for the same reason. This renders the page twice, once
normally and once with every glyph made transparent; the second render IS the ground, and the
ratio is computed against it, per run of text, at several scroll positions, worst pixel wins.

    python3 tools/contrast.py                      # landing page, light + dark
    python3 tools/contrast.py projects/spdef/      # any page
    python3 tools/contrast.py --scheme dark

WHY THE WORST PIXEL IS CHEAP TO FIND: contrast is a V in the ground's luminance with its minimum
where the ground matches the text, so the worst pixel is simply the one whose luminance is
nearest the text's. That also explains the trap this tool exists to catch - if the ground's range
STRADDLES the text's luminance the ratio collapses toward 1:1, and no veil rescues it, because
raising the veil pulls the ground toward --bg from both sides at once. A mid-tone secondary
colour on glass is unfixable by tuning; the colour has to leave the middle.

Runs on the same already-installed Playwright as tools/shoot.py - see that file's header.
"""
import argparse, io, os, socket, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PW_PY = os.path.expanduser("~/miniconda3/envs/4dre/bin/python")

# Re-exec BEFORE the third-party imports, not inside main(): numpy and PIL live in the same env
# as playwright, so a base-python invocation dies at the import line and never reaches the check.
if "playwright" not in sys.modules:
    try:
        import playwright  # noqa: F401
    except ImportError:
        if sys.executable != PW_PY and os.path.exists(PW_PY):
            os.execv(PW_PY, [PW_PY, os.path.abspath(__file__)] + sys.argv[1:])
        sys.exit("playwright not found; see tools/shoot.py's header for the install line.")

import numpy as np
from PIL import Image
# Every element that carries a run of text. A selector matching nothing is simply skipped, so one
# list can cover pages that do not share a vocabulary.
TARGETS = [".role", ".topics li", ".stamplbl", ".stamptxt", "h1", "h2", "h3", "p",
           ".bidx", ".band h3", ".band p", ".tag", ".cta", ".clbl", ".cval", "footer",
           ".artlbl", ".artval", ".artcta", ".minilbl", ".minival"]
# Making the text transparent leaves its box in place, so the boxes measured before the swap
# still address the right pixels afterwards.
GROUND = """*{color:transparent!important;-webkit-text-fill-color:transparent!important;
             text-shadow:none!important}
            .live{background:transparent!important;box-shadow:none!important}"""

_c = np.arange(256) / 255.0
_LUT = np.where(_c <= 0.04045, _c / 12.92, ((_c + 0.055) / 1.055) ** 2.4)


def lum_img(a):
    v = _LUT[a]
    return .2126 * v[..., 0] + .7152 * v[..., 1] + .0722 * v[..., 2]


def lum_rgb(c):
    v = _LUT[list(c)]
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close()
    return p


def measure(pw, page_path, scheme, port):
    from PIL import Image
    browser = pw.chromium.launch()
    pg = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme=scheme)
    pg.goto("http://127.0.0.1:%d/%s" % (port, page_path.lstrip("/")), wait_until="networkidle")
    pg.evaluate("() => Promise.all([...document.images].map(i => i.decode().catch(() => {})))")
    for _ in range(60):
        if pg.evaluate("() => document.fonts.check('700 16px Inter')"):
            break
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(250)
    els = pg.evaluate("""(sels) => {
      const seen = new Set(), out = [];
      for (const s of sels) for (const e of document.querySelectorAll(s)) {
        if (seen.has(e) || !e.textContent.trim()) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        seen.add(e);
        const cs = getComputedStyle(e);
        const col = (cs.webkitTextFillColor && cs.webkitTextFillColor !== 'currentcolor')
                    ? cs.webkitTextFillColor : cs.color;
        out.push({sel:s, col, x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height,
                  size:parseFloat(cs.fontSize), weight:cs.fontWeight});
      }
      return out;}""", TARGETS)
    total = pg.evaluate("document.documentElement.scrollHeight")
    # TWO RENDERS PER SCROLL POSITION, AND THE DIFFERENCE IS THE GLYPH MASK. Sampling a text
    # element's whole box is wrong wherever the ground varies ACROSS it: the art tiles set
    # left-aligned white text in a full-width box over a scrim that ramps to a bright photograph
    # on the right, so the box contains pixels no glyph ever touches and the box-wide worst case
    # is a failure that does not exist. Pixels that changed when the text was made transparent
    # are exactly the pixels the text covers, so the mask is exact and costs one more screenshot.
    shots = {}
    for sy in range(0, max(1, total - 900 + 1), 450):
        pg.evaluate("window.scrollTo(0,%d)" % sy); pg.wait_for_timeout(200)
        lit = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert("RGB")).astype(np.int16)
        shots[sy] = [lit]
    pg.add_style_tag(content=GROUND)
    pg.wait_for_timeout(250)
    for sy in list(shots):
        pg.evaluate("window.scrollTo(0,%d)" % sy); pg.wait_for_timeout(200)
        ground = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert("RGB"))
        lit = shots[sy][0]
        mask = np.abs(lit - ground.astype(np.int16)).max(axis=2) > 10
        shots[sy] = (ground, mask)
    browser.close()

    worst = {}
    for e in els:
        col = tuple(int(float(v)) for v in e["col"]
                    .replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",")[:3])
        cl = lum_rgb(col)
        for sy, (im, mask) in shots.items():
            vy = e["y"] - sy
            if vy < 0 or vy + e["h"] > 900:
                continue
            x0, y0 = max(0, int(e["x"]) - 1), max(0, int(vy) - 1)
            x1 = min(1440, int(e["x"] + e["w"]) + 1)
            y1 = min(900, int(vy + e["h"]) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            m = mask[y0:y1, x0:x1]
            if not m.any():
                continue          # nothing of this element is painted here
            gl = lum_img(im[y0:y1, x0:x1])[m]
            g = gl.flat[int(np.argmin(np.abs(gl - cl)))]
            hi, lo = max(g, cl), min(g, cl)
            r = (hi + .05) / (lo + .05)
            if e["sel"] not in worst or r < worst[e["sel"]][0]:
                worst[e["sel"]] = (r, col, e["size"], e["weight"])
    return worst


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page", nargs="?", default="index.html")
    ap.add_argument("--scheme", default="light,dark")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bad = 0
    try:
        base = "http://127.0.0.1:%d/" % port
        for _ in range(50):
            try:
                urllib.request.urlopen(base, timeout=1).read(1); break
            except Exception:
                time.sleep(0.1)
        else:
            sys.exit("server never came up")
        with sync_playwright() as pw:
            for scheme in [s.strip() for s in args.scheme.split(",") if s.strip()]:
                worst = measure(pw, args.page, scheme, port)
                print("\n=== %s / %s ===   AA needs 4.5:1, or 3:1 for large text" % (args.page, scheme))
                for sel, (r, col, size, weight) in sorted(worst.items(), key=lambda kv: kv[1][0]):
                    large = size >= 24 or (size >= 18.66 and int(weight) >= 700)
                    need = 3.0 if large else 4.5
                    flag = "   <-- FAILS" if r < need else ""
                    if r < need:
                        bad += 1
                    print("  %-14s %5.2f:1   rgb%s  %.0fpx%s  need %.1f%s"
                          % (sel, r, col, size, " large" if large else "", need, flag))
    finally:
        srv.terminate(); srv.wait(timeout=5)
    print("\n%s" % ("all runs of text clear AA" if not bad else "%d FAILING" % bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
