#!/usr/bin/env python3
"""Screenshot pages of this site in a real headless Chromium.

There is no build step and no browser in the loop here, so a layout change is otherwise
only ever checked by arithmetic. This serves the repo over http (ES modules and WebGL2
refuse to run from file://, and the SMV viewer needs both) and photographs it.

    python3 tools/shoot.py                          # landing page, desktop + phone, light + dark
    python3 tools/shoot.py projects/spdef/          # any page, same matrix
    python3 tools/shoot.py --vp all --scheme light  # every preset width, one scheme
    python3 tools/shoot.py --vp 1280x800 --full     # a one-off size, whole scrollable page
    python3 tools/shoot.py --out ~/shots --dpr 2    # somewhere durable, at 2x

EVERYTHING IS ALREADY INSTALLED ON THIS BOX and nothing here needs the network except the
webfont. Playwright lives in the `4dre` conda env and its Chromium is in ~/.cache/ms-playwright;
this script re-execs itself into that interpreter if the one you called it with lacks the
module, so `python3 tools/shoot.py` works from any env. To rebuild that setup from scratch:

    conda run -n 4dre pip install playwright && conda run -n 4dre playwright install chromium

`playwright install-deps` wants root and is NOT needed here - the bundled Chromium launched
with no flags and no sandbox workaround on this node.
"""
import argparse
import os
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The one interpreter on this box that has playwright. Kept as a literal rather than searched
# for, so a failure says which env is missing it instead of silently finding nothing.
PW_PY = os.path.expanduser("~/miniconda3/envs/4dre/bin/python")

# Widths worth looking at, chosen from this site's own breakpoints rather than from a device
# list: the landing page restructures at 900 and drops backdrop-filter at 700, so `mid` and
# `phone` sit either side of those and `narrow` lands between them.
VIEWPORTS = {
    "wide":    (1920, 1080),
    "desktop": (1440, 900),
    "laptop":  (1280, 800),
    "mid":     (1000, 900),
    "narrow":  (860, 1000),
    "phone":   (390, 844),
}
DEFAULT_VPS = ["desktop", "phone"]


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def settle(page, timeout_ms=6000):
    """Block until the page is actually finished painting. Returns True if Inter arrived.

    TWO SEPARATE WAITS, AND MISSING EITHER ONE PHOTOGRAPHS A PAGE THAT DOES NOT EXIST.

    Images: every <img> on this site carries decoding="async", so the browser is free to paint a
    frame before the bitmap is ready - and `networkidle` does not help, because it waits on the
    FETCH and the decode happens after it. Shooting on networkidle alone produced a landing page
    with an empty portrait panel and a blank project band, which reads exactly like a CSS bug and
    is not one. img.decode() resolves only once the frame is decodable, so awaiting all of them is
    the real barrier. It rejects on a broken image, hence the catch - a 404 is verify.py's job to
    report, not a reason to abort the shoot.

    Fonts: the pages load Google Fonts as media="print" with an onload that flips it to "all", so

    the fetch starts LATE - after load, and in principle after document.fonts.ready has already
    resolved against zero pending faces. Shooting on `load` alone therefore photographs the
    Helvetica fallback, which is exactly the thing a typography change is being checked for.
    Poll for the face instead, and let the caller label the shot if it never lands (no network,
    or the font server is slow).
    """
    page.wait_for_load_state("networkidle")
    page.evaluate("() => Promise.all([...document.images].map("
                  "img => img.decode().catch(() => {})))")
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if page.evaluate("() => document.fonts.check('700 16px Inter')"):
            page.evaluate("() => document.fonts.ready")
            return True
        page.wait_for_timeout(120)
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages", nargs="*", default=["index.html"],
                    help="repo-relative page paths or directories (default: index.html)")
    ap.add_argument("--vp", default=",".join(DEFAULT_VPS),
                    help="preset names, WxH pairs, or 'all' (default: %(default)s)")
    ap.add_argument("--scheme", default="light,dark", help="light, dark, or both")
    ap.add_argument("--full", action="store_true",
                    help="whole scrollable page. NOTE: Chromium grows the viewport to do this, so "
                         "the fixed backdrop painting is re-covered at the taller aspect and any "
                         "vh-based padding changes - use it to read content, not to judge the art.")
    ap.add_argument("--dpr", type=float, default=1.0, help="device scale factor (default 1)")
    ap.add_argument("--motion", choices=["allow", "reduce"], default="allow",
                    help="emulate prefers-reduced-motion (default allow)")
    # Playwright spells the off state "no-preference"; "allow" is the friendlier flag word.
    ap.add_argument("--out", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "site-shots"))
    ap.add_argument("--wait", type=int, default=0, help="extra settle time in ms before shooting")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        if sys.executable != PW_PY and os.path.exists(PW_PY):
            os.execv(PW_PY, [PW_PY, os.path.abspath(__file__)] + sys.argv[1:])
        sys.exit("playwright not found, and %s is missing too.\n"
                 "  conda run -n 4dre pip install playwright && "
                 "conda run -n 4dre playwright install chromium" % PW_PY)

    if args.vp == "all":
        vps = [(n, *VIEWPORTS[n]) for n in VIEWPORTS]
    else:
        vps = []
        for tok in args.vp.split(","):
            tok = tok.strip()
            if tok in VIEWPORTS:
                vps.append((tok, *VIEWPORTS[tok]))
            elif "x" in tok:
                w, h = tok.lower().split("x")
                vps.append((tok, int(w), int(h)))
            else:
                sys.exit("unknown viewport %r (presets: %s)" % (tok, ", ".join(VIEWPORTS)))
    schemes = [s.strip() for s in args.scheme.split(",") if s.strip()]
    os.makedirs(args.out, exist_ok=True)

    port = free_port()
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    written, missing_font = [], False
    try:
        base = "http://127.0.0.1:%d" % port
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/", timeout=1).read(1)
                break
            except Exception:
                time.sleep(0.1)
        else:
            sys.exit("server never came up on %d" % port)

        with sync_playwright() as p:
            browser = p.chromium.launch()
            for page_path in args.pages:
                url = base + "/" + page_path.lstrip("/")
                slug = page_path.strip("/").replace("/", "-").replace(".html", "") or "index"
                for scheme in schemes:
                    ctx = browser.new_context(
                        viewport={"width": vps[0][1], "height": vps[0][2]},
                        device_scale_factor=args.dpr,
                        color_scheme=scheme,
                        reduced_motion={"allow": "no-preference"}.get(args.motion, args.motion))
                    page = ctx.new_page()
                    errors = []
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    for name, w, h in vps:
                        page.set_viewport_size({"width": w, "height": h})
                        page.goto(url, wait_until="load")
                        if not settle(page):
                            missing_font = True
                        page.wait_for_timeout(args.wait or 150)
                        out = os.path.join(
                            args.out, "%s_%s_%s%s.png" % (slug, name, scheme,
                                                          "_full" if args.full else ""))
                        page.screenshot(path=out, full_page=args.full)
                        written.append(out)
                        print("  %-58s %dx%d %s" % (os.path.basename(out), w, h, scheme))
                    for e in errors:
                        print("  !! page error on %s: %s" % (page_path, e.splitlines()[0][:160]))
                    ctx.close()
            browser.close()
    finally:
        srv.terminate()
        srv.wait(timeout=5)

    if missing_font:
        print("\n  !! Inter never loaded - these shots show the fallback stack, not the real face.")
    print("\n%d shot(s) in %s" % (len(written), args.out))


if __name__ == "__main__":
    main()
