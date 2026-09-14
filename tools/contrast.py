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
           ".artlbl", ".artval", ".artcta", ".minilbl", ".minival",
           # The oil-paint tuner's runs. Its panes carry small monospace parameter names and an
           # 11px stats line, which is why its veil is raised above the landing page's — these
           # are the selectors that prove the raise was enough. Deliberately NOT `button` or
           # `.wipe .tag`: those two sit on a photograph the visitor chose, which has no
           # measurable ground, so including them would report a failure about someone's snapshot.
           # the Miscellany shelf's items (the .mtitle window is skipped by the clip test below)
           ".mkick", ".mdesc", ".mgo",
           ".back", ".card h2", ".row .name", ".row .val", ".row .hint", ".swatch em",
           "#stats span", ".bar-row button", "label.tog", "#status", ".fovhint", ".note li"]
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
    # MEASURED WITH REDUCED MOTION, and that is a requirement rather than a preference. The
    # proof below needs the page to reproduce a frame byte for byte; anything animating for
    # ever makes that impossible, and the landing page's `.live` status dot pulses on a 2.4 s
    # loop. Every animation on this site is switched off in its own `prefers-reduced-motion`
    # block -- that is the site's own rule -- so asking for it is asking for a state the pages
    # already promise, and contrast does not depend on motion. It doubles as a check of the
    # rule: a page that will not hold still here has something moving outside that block.
    pg = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme=scheme,
                          reduced_motion="reduce")
    pg.goto("http://127.0.0.1:%d/%s" % (port, page_path.lstrip("/")), wait_until="networkidle")
    pg.evaluate("() => Promise.all([...document.images].map(i => i.decode().catch(() => {})))")
    for _ in range(60):
        if pg.evaluate("() => document.fonts.check('700 16px Inter')"):
            break
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(250)
    # WAIT FOR THE PAGE TO STOP MOVING, which `networkidle` does not do. The oil-paint tuner
    # renders its sample painting on the main thread's clock rather than on the network's: a
    # draft lands at ~1 s and the refine seconds later, and the stats line it writes changes
    # height, so EVERY panel below it shifts. Screenshot the lit page before that settles and
    # the ground pass afterwards, and the "changed pixels" mask stops being a glyph mask and
    # becomes the whole page -- which reads out as a spread of impossible 1.00:1 failures on
    # runs of text that are in fact fine. Two identical frames 400 ms apart is the cheapest
    # test that covers a render, a spinner's ticking clock and a late webfont swap at once.
    prev, still = None, 0
    for _ in range(150):
        cur = pg.screenshot()
        still = still + 1 if cur == prev else 0
        if still >= 2:
            break
        prev = cur
        pg.wait_for_timeout(400)
    els = pg.evaluate("""(sels) => {
      const seen = new Set(), out = [];
      for (const s of sels) for (const e of document.querySelectorAll(s)) {
        if (seen.has(e) || !e.textContent.trim()) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const cs0 = getComputedStyle(e);
        // TEXT CLIPPED OUT OF A PICTURE CANNOT BE MEASURED THIS WAY, and skipping it is not a
        // dodge. Making the fill transparent is exactly what such an element does on hover: the
        // "ground" the second render exposes inside its glyphs is its OWN image, not what is
        // behind it, so the difference is not a glyph mask and the worst pixel is whichever
        // one happens to match the fill -- 1.00:1, always, on a title that is in fact opaque
        // ink on paper. The Miscellany shelf's two titles are the case. Their revealed state
        // is a real measurement and it is made where the picture is BAKED
        // (tools/bake_oilpaint_type.py), against the paper, over every pixel.
        if (cs0.webkitBackgroundClip === 'text' || cs0.backgroundClip === 'text') continue;
        seen.add(e);
        const cs = cs0;
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
    # THE TWO PASSES ARE PROVEN TO DESCRIBE THE SAME PAGE, not assumed to. Everything above is
    # a heuristic for "has it stopped moving", and a heuristic is exactly what this cannot rest
    # on: a page whose picture is still being computed -- the oil-paint tuner renders its
    # sample on its own clock -- can sit perfectly still for a second while a worker is busy,
    # break the stillness test, and then repaint between the lit pass and the ground pass. When
    # that happens the changed-pixel mask stops being a glyph mask and becomes the whole page,
    # and the readout is a spread of impossible 1.00:1 failures on runs of text that are fine.
    # So the style is REMOVED again afterwards and every position re-shot: if the page comes
    # back byte-identical to its lit frame, nothing moved in between and the mask is exact. If
    # it does not, the capture is thrown away and retried rather than reported.
    positions = list(range(0, max(1, total - 900 + 1), 450))

    def capture():
        lit = {}
        for sy in positions:
            pg.evaluate("window.scrollTo(0,%d)" % sy); pg.wait_for_timeout(200)
            lit[sy] = pg.screenshot()
        tag = pg.add_style_tag(content=GROUND)
        pg.wait_for_timeout(250)
        gnd = {}
        for sy in positions:
            pg.evaluate("window.scrollTo(0,%d)" % sy); pg.wait_for_timeout(200)
            gnd[sy] = pg.screenshot()
        tag.evaluate("e => e.remove()")
        pg.wait_for_timeout(250)
        for sy in positions:                      # the proof
            pg.evaluate("window.scrollTo(0,%d)" % sy); pg.wait_for_timeout(200)
            if pg.screenshot() != lit[sy]:
                return None
        return lit, gnd

    got = None
    for attempt in range(4):
        got = capture()
        if got:
            break
        pg.wait_for_timeout(3000)
    if not got:
        browser.close()
        sys.exit("%s / %s: the page kept repainting between the two passes, so no glyph mask "
                 "can be trusted. Nothing was measured." % (page_path, scheme))

    lit_png, gnd_png = got
    shots = {}
    for sy in positions:
        lit = np.asarray(Image.open(io.BytesIO(lit_png[sy])).convert("RGB")).astype(np.int16)
        ground = np.asarray(Image.open(io.BytesIO(gnd_png[sy])).convert("RGB"))
        shots[sy] = (ground, np.abs(lit - ground.astype(np.int16)).max(axis=2) > 10)
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
