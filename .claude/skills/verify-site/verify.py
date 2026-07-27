#!/usr/bin/env python3
"""
Static checks for this site. Stdlib only — no deps, no network, no build step.

Catches the failure modes this repo actually hits: a stale closing tag left behind by an
edit, an unbalanced <style> block, a getElementById() whose element was deleted (throws on
page load, blanking the viewer), a page that tints itself but not the browser chrome around
it (Safari then renders white where Chrome does not), a referenced asset that was never
committed, and a root-absolute path that breaks the project-site subpath deploy.

    python3 .claude/skills/verify-site/verify.py            # static checks
    python3 .claude/skills/verify-site/verify.py --serve    # + serve and GET everything

Exit code 0 = all clear, 1 = at least one FAIL.
"""
import html.parser
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
PAGES = ["index.html", "projects/smv/index.html", "projects/spdef/index.html"]
# JS modules are scanned for asset refs too — the ~31 MB vendor/ wasm is reached from
# decode_motion.js, not from any page, so a page-only sweep would miss it entirely.
MODULES = ["projects/smv/decode.js", "projects/smv/decode_motion.js",
           "projects/smv/dequant_worker.js", "projects/smv/sw.js"]

VOID = {"br", "img", "input", "meta", "link", "hr", "source", "area", "base",
        "col", "embed", "param", "track", "wbr"}

fails, warns = [], []


def fail(page, msg):
    fails.append(f"{page}: {msg}")


def warn(page, msg):
    warns.append(f"{page}: {msg}")


class Nesting(html.parser.HTMLParser):
    """Flags a close tag that doesn't match the innermost open tag."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errs = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errs.append(f"stray </{tag}> at line {self.getpos()[0]}")
            return
        if self.stack[-1][0] != tag:
            open_tag, open_line = self.stack[-1]
            self.errs.append(
                f"</{tag}> at line {self.getpos()[0]} closes <{open_tag}> "
                f"opened at line {open_line}")
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    return
            return
        self.stack.pop()


def check_nesting(page, src):
    p = Nesting()
    p.feed(src)
    for e in p.errs:
        fail(page, e)
    for tag, line in p.stack:
        if tag not in ("html", "body"):
            fail(page, f"<{tag}> opened at line {line} is never closed")
    if not p.errs and not [t for t, _ in p.stack if t not in ("html", "body")]:
        print(f"  ok    tag nesting")


def check_css(page, src):
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)
    if not blocks:
        return
    for i, css in enumerate(blocks):
        o, c = css.count("{"), css.count("}")
        if o != c:
            fail(page, f"<style> block {i}: {o} '{{' vs {c} '}}' — unbalanced")
        else:
            print(f"  ok    css braces ({o} rules)")


def check_dom_ids(page, src):
    """Every id the JS reaches for must exist, or the page throws on load."""
    ids = set(re.findall(r'\bid="([A-Za-z][\w-]*)"', src))
    refs = set()
    for pat in (r"getElementById\(\s*['\"]([^'\"]+)['\"]",
                r"_ctl\(\s*['\"]([^'\"]+)['\"]",
                r"_gate\(\s*['\"]([^'\"]+)['\"]",
                r"querySelector\(\s*['\"]#([\w-]+)['\"]"):
        refs |= set(re.findall(pat, src))
    missing = sorted(refs - ids)
    if missing:
        fail(page, f"JS references ids with no element: {', '.join(missing)}")
    else:
        print(f"  ok    dom ids ({len(refs)} referenced, all present)")


def check_page_chrome(page, src):
    """Every page must declare color-scheme, a theme-color, and paint html's background.

    Without these the *page* is tinted but the browser chrome around it is not, and the two
    browsers disagree about the gap: Chrome infers the canvas from the body background,
    Safari leaves it white — canvas, scrollbars, form controls, the iOS toolbars, and the
    overscroll area Safari rubber-bands into. That is invisible on a near-white palette and
    glaring on this site's warm paper. All three are one-liners; a new project page that
    picks its own palette must carry them too.
    """
    style = re.sub(r"/\*.*?\*/", "", "\n".join(
        re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)), flags=re.S)
    if not style:
        return

    if "color-scheme" not in style:
        fail(page, "no `color-scheme` declared — Safari paints the UA canvas white "
                   "regardless of --bg (use `light dark` if themed, `light` if fixed)")

    # `([^{}]*)\{([^{}]*)\}` only ever matches innermost rules, so a rule nested in @media is
    # found and the @media wrapper itself is skipped. Good enough without a real CSS parser.
    html_bg = any(
        "background" in decls
        and "html" in [t for t in re.split(r"[\s,>+~]+", sel.strip()) if t]
        for sel, decls in re.findall(r"([^{}]*)\{([^{}]*)\}", style))
    if not html_bg:
        fail(page, "no `background` on an `html` rule — body's background propagates to the "
                   "canvas but not to Safari's overscroll area")

    metas = re.findall(r"<meta[^>]*name=\"theme-color\"[^>]*>", src)
    if not metas:
        fail(page, "no <meta name=\"theme-color\"> — Safari 15+ tints its tab bar and the iOS "
                   "toolbars from it, and falls back to white without one")
        return

    # Drift guard: the meta is markup and --bg is CSS, so nothing but this keeps them together
    # when a palette is retuned. A WARN, not a FAIL — pointing theme-color at a header or hero
    # colour instead of the page background is a legitimate choice.
    lo = style.lower()
    for m in metas:
        c = re.search(r'content="([^"]+)"', m)
        if c and c.group(1).strip().lower() not in lo:
            warn(page, f'theme-color {c.group(1)} appears nowhere in the CSS — likely drifted '
                       f'from --bg')
    print(f"  ok    page chrome (color-scheme, {len(metas)} theme-color, html background)")


def local_refs(src):
    """Relative asset/module paths referenced by this page.

    HTML comments are stripped first: commented-out markup is not live, and a template
    comment showing `href="…"` would otherwise be reported as a missing file.
    """
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    out = set()
    for pat in (r'(?:src|href)="([^"]+)"',
                r"url\(\s*['\"]?([^'\")]+)",
                r"from\s+['\"](\./[^'\"]+)['\"]",
                r"new\s+URL\(\s*['\"](\./[^'\"]+)['\"]",
                r"fetch\(\s*['\"]([^'\"`]+)['\"]",          # scenes.json
                r"\.register\(\s*['\"]([^'\"]+)['\"]"):     # sw.js
        out |= set(re.findall(pat, src))
    keep = set()
    for r in out:
        if re.match(r"^(https?:|mailto:|data:|//|#|\?)", r) or not r:
            continue
        keep.add(r.split("#")[0].split("?")[0])
    return keep


def check_assets(page, src):
    base = os.path.dirname(os.path.join(ROOT, page))
    bad = []
    n = 0
    for ref in sorted(local_refs(src)):
        if ref.startswith("/"):
            fail(page, f'root-absolute path "{ref}" breaks the project-site subpath deploy')
            continue
        target = os.path.normpath(os.path.join(base, ref))
        if ref.endswith("/") or os.path.isdir(target):
            probe = os.path.join(target, "index.html")
            if not os.path.exists(probe):
                bad.append(f"{ref} (no index.html)")
            else:
                n += 1
            continue
        if not os.path.exists(target):
            bad.append(ref)
        else:
            n += 1
    for b in bad:
        fail(page, f"missing on disk: {b}")
    if not bad:
        print(f"  ok    local refs ({n} resolve on disk)")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def check_served():
    """Serve the repo and GET every page plus every asset it references."""
    port = free_port()
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/", timeout=1).read(1)
                break
            except Exception:
                time.sleep(0.1)
        else:
            fail("serve", "server never came up")
            return

        urls = {"/" + p for p in PAGES}
        urls |= {"/" + os.path.dirname(PAGES[1]) + "/"}
        for page in PAGES + MODULES:
            src = open(os.path.join(ROOT, page), encoding="utf-8").read()
            d = os.path.dirname(page)
            for ref in local_refs(src):
                if ref.startswith("/"):
                    continue
                urls.add("/" + os.path.normpath(os.path.join(d, ref)).replace(os.sep, "/"))

        ok = 0
        for u in sorted(urls):
            try:
                # quote non-ascii so a stray unicode path reports as a FAIL, not a traceback
                code = urllib.request.urlopen(
                    base + urllib.parse.quote(u), timeout=10).status
            except urllib.error.HTTPError as e:
                code = e.code
            except Exception as e:
                fail("serve", f"{u} -> {e}")
                continue
            if code != 200:
                fail("serve", f"{u} -> HTTP {code}")
            else:
                ok += 1
        print(f"  ok    served {ok}/{len(urls)} urls returned 200")
    finally:
        srv.terminate()
        srv.wait(timeout=10)


def main():
    print(f"verify-site  root={ROOT}")
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            fail(page, "page does not exist")
            continue
        src = open(path, encoding="utf-8").read()
        print(f"\n{page}  ({len(src):,} bytes)")
        check_nesting(page, src)
        check_css(page, src)
        check_dom_ids(page, src)
        check_page_chrome(page, src)
        check_assets(page, src)

    for mod in MODULES:
        path = os.path.join(ROOT, mod)
        if not os.path.exists(path):
            fail(mod, "module referenced by the viewer does not exist")
            continue
        print(f"\n{mod}")
        check_assets(mod, open(path, encoding="utf-8").read())

    if "--serve" in sys.argv:
        print("\nserved")
        check_served()

    print()
    for w in warns:
        print(f"WARN  {w}")
    for f in fails:
        print(f"FAIL  {f}")
    if fails:
        print(f"\n{len(fails)} failure(s)")
        return 1
    print("all clear" + (f" ({len(warns)} warning(s))" if warns else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
